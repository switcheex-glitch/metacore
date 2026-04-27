-- Metacore billing schema.
-- Run this in Supabase Dashboard → SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.metacore_keys (
  key text primary key default ('mc_' || replace(gen_random_uuid()::text, '-', '')),
  email text not null,
  tier text not null default 'standard',
  tokens_limit int not null default 200,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz
);

create index if not exists metacore_keys_email_idx on public.metacore_keys (email);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text,
  contract_id text,
  email text not null,
  product_id text,
  offer_id text,
  amount numeric,
  currency text,
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  key_issued text references public.metacore_keys(key)
);

create unique index if not exists payments_contract_idx on public.payments (provider, contract_id) where contract_id is not null;

-- Validation endpoint helper (callable by anon with RPC, returns minimal info).
create or replace function public.validate_metacore_key(p_key text)
returns table (valid boolean, tier text, tokens_limit int, revoked boolean)
language sql
security definer
set search_path = public
as $$
  update public.metacore_keys set last_seen_at = now() where key = p_key;
  select
    (k.key is not null and k.revoked_at is null) as valid,
    k.tier,
    k.tokens_limit,
    (k.revoked_at is not null) as revoked
  from public.metacore_keys k
  where k.key = p_key;
$$;

grant execute on function public.validate_metacore_key(text) to anon, authenticated;

-- RLS: lock everything. Only service_role (server-side) touches these tables.
alter table public.metacore_keys enable row level security;
alter table public.payments enable row level security;

-- Explicit deny policies for anon/authenticated (service_role bypasses RLS).
drop policy if exists "deny all reads on metacore_keys" on public.metacore_keys;
drop policy if exists "deny all writes on metacore_keys" on public.metacore_keys;
create policy "deny all reads on metacore_keys"  on public.metacore_keys for select using (false);
create policy "deny all writes on metacore_keys" on public.metacore_keys for all    using (false) with check (false);

drop policy if exists "deny all reads on payments" on public.payments;
drop policy if exists "deny all writes on payments" on public.payments;
create policy "deny all reads on payments"  on public.payments for select using (false);
create policy "deny all writes on payments" on public.payments for all    using (false) with check (false);

-- Rate limiting for validate_metacore_key: max 30 calls per minute per key.
create table if not exists public.validate_calls (
  key text not null,
  ts timestamptz not null default now()
);
create index if not exists validate_calls_key_ts_idx on public.validate_calls (key, ts desc);

create or replace function public.validate_metacore_key(p_key text)
returns table (valid boolean, tier text, tokens_limit int, revoked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  -- Reject payloads that are obviously not keys.
  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then
    return query select false, null::text, 0, false;
    return;
  end if;

  select count(*) into recent_count
  from public.validate_calls
  where key = p_key and ts > now() - interval '1 minute';

  if recent_count > 30 then
    -- Throttle — respond as revoked to burn brute-force attempts.
    return query select false, null::text, 0, true;
    return;
  end if;

  insert into public.validate_calls (key) values (p_key);

  update public.metacore_keys set last_seen_at = now() where key = p_key;

  return query
    select
      (k.key is not null and k.revoked_at is null) as valid,
      k.tier,
      k.tokens_limit,
      (k.revoked_at is not null) as revoked
    from public.metacore_keys k
    where k.key = p_key;
end;
$$;

-- Periodic cleanup of rate-limit rows older than 10 minutes.
create or replace function public.cleanup_validate_calls()
returns void language sql security definer as $$
  delete from public.validate_calls where ts < now() - interval '10 minutes';
$$;
