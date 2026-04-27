-- Payouts: authors request withdrawals against their accrued earnings.
-- Author balance = sum(author_earnings.author_kopecks where status='accrued')
--   minus sum(payout_requests where status in ('pending','approved','paid'))

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  author_key text not null references public.metacore_keys(key) on delete cascade,
  amount_kopecks bigint not null check (amount_kopecks > 0),
  method text not null check (method in ('usdt_trc20', 'usdt_erc20')),
  details text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists payout_requests_by_author
  on public.payout_requests (author_key, created_at desc);

alter table public.payout_requests enable row level security;

drop policy if exists "deny all on payouts" on public.payout_requests;
create policy "deny all on payouts" on public.payout_requests
  for all using (false) with check (false);

-- Available balance = accrued earnings minus already-requested-or-paid amounts.
create or replace function public.get_payout_balance(p_key text)
returns table (
  available_kopecks bigint,
  total_earned_kopecks bigint,
  pending_kopecks bigint,
  paid_kopecks bigint
)
language plpgsql security definer set search_path = public as $$
declare
  earned bigint;
  reserved bigint;
  paid bigint;
begin
  select coalesce(sum(author_kopecks), 0) into earned
    from public.author_earnings
    where author_key = p_key and status in ('accrued', 'paid');

  select coalesce(sum(amount_kopecks), 0) into reserved
    from public.payout_requests
    where author_key = p_key and status in ('pending', 'approved');

  select coalesce(sum(amount_kopecks), 0) into paid
    from public.payout_requests
    where author_key = p_key and status = 'paid';

  return query select
    greatest(0, earned - reserved - paid)::bigint,
    earned,
    reserved,
    paid;
end;
$$;
grant execute on function public.get_payout_balance(text) to anon, authenticated;

-- List my payout requests.
create or replace function public.list_my_payouts(p_key text)
returns table (
  id uuid,
  amount_kopecks bigint,
  method text,
  details text,
  status text,
  admin_note text,
  created_at timestamptz,
  processed_at timestamptz
)
language sql security definer set search_path = public as $$
  select id, amount_kopecks, method, details, status, admin_note, created_at, processed_at
  from public.payout_requests
  where author_key = p_key
  order by created_at desc
  limit 200;
$$;
grant execute on function public.list_my_payouts(text) to anon, authenticated;

-- Atomically check balance + insert payout request.
create or replace function public.request_payout(
  p_key text, p_amount bigint, p_method text, p_details text
) returns table (ok boolean, reason text, request_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  available bigint;
  new_id uuid;
begin
  if p_key is null or length(p_key) < 8 then
    return query select false, 'bad_key', null::uuid; return;
  end if;
  if not exists (select 1 from public.metacore_keys where key = p_key and revoked_at is null) then
    return query select false, 'bad_key', null::uuid; return;
  end if;
  if p_amount < 50000 then
    return query select false, 'amount_too_small', null::uuid; return;
  end if;
  if p_method not in ('usdt_trc20', 'usdt_erc20') then
    return query select false, 'bad_method', null::uuid; return;
  end if;
  if length(coalesce(p_details, '')) < 4 or length(p_details) > 200 then
    return query select false, 'bad_details', null::uuid; return;
  end if;
  select greatest(0,
    (select coalesce(sum(author_kopecks),0) from public.author_earnings
       where author_key = p_key and status in ('accrued', 'paid'))
    - (select coalesce(sum(amount_kopecks),0) from public.payout_requests
       where author_key = p_key and status in ('pending', 'approved', 'paid'))
  ) into available;
  if available < p_amount then
    return query select false, 'insufficient_balance', null::uuid; return;
  end if;
  insert into public.payout_requests (author_key, amount_kopecks, method, details)
    values (p_key, p_amount, p_method, p_details)
    returning id into new_id;
  return query select true, 'ok', new_id;
end;
$$;
grant execute on function public.request_payout(text, bigint, text, text) to anon, authenticated;

-- Admin-friendly view: amount in rubles next to kopecks for Table Editor browsing.
create or replace view public.payout_requests_admin as
select
  id,
  author_key,
  amount_kopecks,
  (amount_kopecks::numeric / 100)::numeric(12, 2) as amount_rub,
  method,
  details,
  status,
  admin_note,
  created_at,
  processed_at
from public.payout_requests
order by created_at desc;

comment on view public.payout_requests_admin is
  'Read-only view: payout_requests with amount_rub (kopecks/100) for human-friendly admin browsing.';

-- Run with caller's RLS, not the view-creator's privileges (Postgres 15+).
alter view public.payout_requests_admin set (security_invoker = on);
-- Lock anon/authenticated out of the REST API for this view; only the
-- service_role / postgres (Table Editor) can read it.
revoke all on public.payout_requests_admin from anon, authenticated;
