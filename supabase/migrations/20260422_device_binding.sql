-- Device / HWID binding for metacore_keys.
-- One key = one device + email. Admin can clear to re-bind.

alter table public.metacore_keys
  add column if not exists device_id text,
  add column if not exists activated_at timestamptz,
  add column if not exists last_device_mismatch_at timestamptz;

-- Activation — called once after payment. Locks key to (email, device_id).
-- Re-calling with the same (key, device_id, email) is idempotent.
-- Different device → false; re-binding allowed only by admin (device_id cleared).
create or replace function public.activate_metacore_key(
  p_key text,
  p_email text,
  p_device_id text
) returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  row_key public.metacore_keys%rowtype;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then
    return query select false, 'bad_key_format'; return;
  end if;
  if p_device_id is null or length(p_device_id) < 16 or length(p_device_id) > 128 then
    return query select false, 'bad_device_id'; return;
  end if;
  if p_email is null or length(p_email) < 3 or length(p_email) > 256 then
    return query select false, 'bad_email'; return;
  end if;

  select * into row_key from public.metacore_keys where key = p_key limit 1;
  if not found then
    return query select false, 'not_found'; return;
  end if;
  if row_key.revoked_at is not null then
    return query select false, 'revoked'; return;
  end if;
  if lower(row_key.email) <> lower(p_email) then
    return query select false, 'email_mismatch'; return;
  end if;

  if row_key.device_id is null then
    update public.metacore_keys
      set device_id = p_device_id, activated_at = now()
      where key = p_key;
    return query select true, 'activated'; return;
  end if;

  if row_key.device_id = p_device_id then
    return query select true, 'already_activated'; return;
  end if;

  update public.metacore_keys
    set last_device_mismatch_at = now()
    where key = p_key;
  return query select false, 'device_mismatch';
end;
$$;

grant execute on function public.activate_metacore_key(text, text, text) to anon, authenticated;

-- Enforced validate: now also checks that device_id matches.
create or replace function public.validate_metacore_key(p_key text, p_device_id text default null)
returns table (valid boolean, tier text, tokens_limit int, revoked boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  row_key public.metacore_keys%rowtype;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 128 then
    return query select false, null::text, 0, false, 'bad_key'; return;
  end if;

  select count(*) into recent_count
  from public.validate_calls
  where key = p_key and ts > now() - interval '1 minute';

  if recent_count > 30 then
    return query select false, null::text, 0, true, 'rate_limited'; return;
  end if;

  insert into public.validate_calls (key) values (p_key);

  select * into row_key from public.metacore_keys where key = p_key limit 1;
  if not found then
    return query select false, null::text, 0, false, 'not_found'; return;
  end if;
  if row_key.revoked_at is not null then
    return query select false, null::text, 0, true, 'revoked'; return;
  end if;

  -- Device enforcement: if the key has been activated and we got a device_id,
  -- it must match. If no device_id sent, still allow (legacy / before activation).
  if row_key.device_id is not null and p_device_id is not null
     and row_key.device_id <> p_device_id then
    update public.metacore_keys set last_device_mismatch_at = now() where key = p_key;
    return query select false, row_key.tier, row_key.tokens_limit, false, 'device_mismatch'; return;
  end if;

  update public.metacore_keys set last_seen_at = now() where key = p_key;
  return query select true, row_key.tier, row_key.tokens_limit, false, 'ok';
end;
$$;

grant execute on function public.validate_metacore_key(text, text) to anon, authenticated;
