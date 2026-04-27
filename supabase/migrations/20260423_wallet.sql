-- Metacore user wallet: balance in RUB (kopecks), transaction history.
-- Run in Supabase Dashboard → SQL Editor.

create table if not exists public.wallets (
  key text primary key references public.metacore_keys(key) on delete cascade,
  balance_kopecks bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  key text not null references public.metacore_keys(key) on delete cascade,
  kind text not null check (kind in ('top_up','purchase','refund','manual_credit','manual_debit')),
  amount_kopecks bigint not null,
  status text not null default 'pending' check (status in ('pending','completed','failed','canceled')),
  provider text,
  external_id text,
  contract_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists wallet_tx_by_key on public.wallet_transactions (key, created_at desc);
create unique index if not exists wallet_tx_provider_contract
  on public.wallet_transactions (provider, contract_id)
  where contract_id is not null;

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "deny all reads on wallets" on public.wallets;
drop policy if exists "deny all writes on wallets" on public.wallets;
create policy "deny all reads on wallets" on public.wallets for select using (false);
create policy "deny all writes on wallets" on public.wallets for all using (false) with check (false);

drop policy if exists "deny all reads on wallet_transactions" on public.wallet_transactions;
drop policy if exists "deny all writes on wallet_transactions" on public.wallet_transactions;
create policy "deny all reads on wallet_transactions" on public.wallet_transactions for select using (false);
create policy "deny all writes on wallet_transactions" on public.wallet_transactions for all using (false) with check (false);

-- Read wallet for a given license key. Anon-friendly via RPC.
create or replace function public.get_wallet(p_key text)
returns table (balance_kopecks bigint, currency text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then
    return query select 0::bigint, 'RUB'::text; return;
  end if;
  insert into public.wallets (key, balance_kopecks)
    select p_key, 0
    where exists (select 1 from public.metacore_keys where key = p_key)
    on conflict (key) do nothing;
  return query
    select coalesce(w.balance_kopecks, 0), 'RUB'::text
    from public.wallets w where w.key = p_key;
end;
$$;
grant execute on function public.get_wallet(text) to anon, authenticated;

-- List recent transactions for a key.
create or replace function public.list_wallet_transactions(p_key text, p_limit int default 50)
returns table (
  id uuid, kind text, amount_kopecks bigint, status text,
  provider text, created_at timestamptz, completed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.id, t.kind, t.amount_kopecks, t.status, t.provider, t.created_at, t.completed_at
  from public.wallet_transactions t
  where t.key = p_key
  order by t.created_at desc
  limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.list_wallet_transactions(text, int) to anon, authenticated;

-- Create a pending top-up record. Client gets the id and calls the payment
-- provider (Platega) separately; the provider's postback later flips the
-- status to completed via apply_wallet_postback (service_role only).
create or replace function public.create_topup(p_key text, p_amount_kopecks bigint)
returns table (tx_id uuid, amount_kopecks bigint)
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if p_amount_kopecks < 10000 or p_amount_kopecks > 100000000 then
    raise exception 'amount_out_of_range';
  end if;
  if not exists (select 1 from public.metacore_keys where key = p_key and revoked_at is null) then
    raise exception 'bad_key';
  end if;
  insert into public.wallet_transactions (key, kind, amount_kopecks, status, provider)
    values (p_key, 'top_up', p_amount_kopecks, 'pending', 'platega')
    returning id into new_id;
  return query select new_id, p_amount_kopecks;
end;
$$;
grant execute on function public.create_topup(text, bigint) to anon, authenticated;

-- Charge (purchase). Atomically debits the wallet if balance is sufficient.
create or replace function public.charge_wallet(
  p_key text,
  p_amount_kopecks bigint,
  p_item_id text,
  p_item_name text
) returns table (ok boolean, reason text, new_balance_kopecks bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur bigint;
begin
  if p_amount_kopecks <= 0 then
    return query select false, 'bad_amount', 0::bigint; return;
  end if;
  if not exists (select 1 from public.metacore_keys where key = p_key and revoked_at is null) then
    return query select false, 'bad_key', 0::bigint; return;
  end if;
  insert into public.wallets (key, balance_kopecks) values (p_key, 0) on conflict (key) do nothing;
  select balance_kopecks into cur from public.wallets where key = p_key for update;
  if cur < p_amount_kopecks then
    return query select false, 'insufficient_funds', cur; return;
  end if;
  update public.wallets set balance_kopecks = balance_kopecks - p_amount_kopecks, updated_at = now() where key = p_key;
  insert into public.wallet_transactions (key, kind, amount_kopecks, status, provider, metadata, completed_at)
    values (p_key, 'purchase', p_amount_kopecks, 'completed', 'internal',
            jsonb_build_object('item_id', p_item_id, 'item_name', p_item_name), now());
  return query select true, 'ok', cur - p_amount_kopecks;
end;
$$;
grant execute on function public.charge_wallet(text, bigint, text, text) to anon, authenticated;

-- Postback from Platega — ONLY service_role should call this (via Edge
-- Function). Flips a pending tx to completed and credits the wallet.
create or replace function public.apply_wallet_postback(
  p_tx_id uuid,
  p_contract_id text,
  p_status text,
  p_external_id text default null
) returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_tx public.wallet_transactions%rowtype;
begin
  select * into row_tx from public.wallet_transactions where id = p_tx_id for update;
  if not found then
    return query select false, 'tx_not_found'; return;
  end if;
  if row_tx.status <> 'pending' then
    return query select true, 'already_final'; return;
  end if;
  if p_status = 'success' or p_status = 'completed' or p_status = 'paid' then
    update public.wallet_transactions
      set status='completed', completed_at=now(), contract_id=p_contract_id, external_id=p_external_id
      where id = p_tx_id;
    insert into public.wallets (key, balance_kopecks) values (row_tx.key, 0) on conflict (key) do nothing;
    update public.wallets set balance_kopecks = balance_kopecks + row_tx.amount_kopecks, updated_at = now()
      where key = row_tx.key;
    return query select true, 'credited';
  else
    update public.wallet_transactions
      set status='failed', completed_at=now(), contract_id=p_contract_id, external_id=p_external_id
      where id = p_tx_id;
    return query select true, 'failed';
  end if;
end;
$$;
-- only service_role executes this (no anon grant).
revoke all on function public.apply_wallet_postback(uuid, text, text, text) from anon, authenticated;
