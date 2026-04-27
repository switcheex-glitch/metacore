-- Wallet-backed purchases: atomic charge + purchase record.
-- Run in Supabase Dashboard → SQL Editor.

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  key text not null references public.metacore_keys(key) on delete cascade,
  item_id text not null,
  item_name text not null,
  category text,
  price_kopecks bigint not null,
  status text not null default 'delivered' check (status in ('delivered','refunded')),
  created_at timestamptz not null default now()
);

create index if not exists purchases_by_key on public.purchases (key, created_at desc);
create unique index if not exists purchases_unique_item on public.purchases (key, item_id)
  where status = 'delivered';

alter table public.purchases enable row level security;

drop policy if exists "deny all reads on purchases" on public.purchases;
drop policy if exists "deny all writes on purchases" on public.purchases;
create policy "deny all reads on purchases" on public.purchases for select using (false);
create policy "deny all writes on purchases" on public.purchases for all using (false) with check (false);

-- Replace charge_wallet so it also records into purchases (idempotent per item
-- per key — a second attempt just returns the existing purchase).
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
  if exists (select 1 from public.purchases where key = p_key and item_id = p_item_id and status = 'delivered') then
    select balance_kopecks into cur from public.wallets where key = p_key;
    return query select false, 'already_owned', coalesce(cur, 0); return;
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
  insert into public.purchases (key, item_id, item_name, price_kopecks)
    values (p_key, p_item_id, p_item_name, p_amount_kopecks);
  return query select true, 'ok', cur - p_amount_kopecks;
end;
$$;
grant execute on function public.charge_wallet(text, bigint, text, text) to anon, authenticated;

create or replace function public.list_purchases(p_key text)
returns table (item_id text, item_name text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select p.item_id, p.item_name, p.created_at
  from public.purchases p
  where p.key = p_key and p.status = 'delivered'
  order by p.created_at desc;
$$;
grant execute on function public.list_purchases(text) to anon, authenticated;
