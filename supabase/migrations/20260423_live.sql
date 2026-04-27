-- Live session share (polling-based broadcast between two clients).

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_key text references public.metacore_keys(key) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.live_events (
  id bigserial primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_key text,
  kind text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists live_events_by_session on public.live_events (session_id, id);

alter table public.live_sessions enable row level security;
alter table public.live_events enable row level security;
drop policy if exists "deny all on live_sessions" on public.live_sessions;
drop policy if exists "deny all on live_events" on public.live_events;
create policy "deny all on live_sessions" on public.live_sessions for all using (false) with check (false);
create policy "deny all on live_events" on public.live_events for all using (false) with check (false);

create or replace function public.live_create_session(p_key text, p_title text)
returns table (id uuid)
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_key is null or not exists (select 1 from public.metacore_keys where key = p_key and revoked_at is null) then
    raise exception 'bad_key';
  end if;
  insert into public.live_sessions (host_key, title) values (p_key, p_title) returning id into new_id;
  return query select new_id;
end;
$$;
grant execute on function public.live_create_session(text, text) to anon, authenticated;

create or replace function public.live_push_event(
  p_session_id uuid, p_actor_key text, p_kind text, p_data jsonb
) returns table (id bigint)
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  insert into public.live_events (session_id, actor_key, kind, data)
    values (p_session_id, p_actor_key, p_kind, p_data)
    returning id into new_id;
  update public.live_sessions set last_seen_at = now() where id = p_session_id;
  return query select new_id;
end;
$$;
grant execute on function public.live_push_event(uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.live_poll(
  p_session_id uuid, p_after_id bigint
) returns table (id bigint, actor_key text, kind text, data jsonb, created_at timestamptz)
language sql security definer set search_path = public as $$
  select e.id, e.actor_key, e.kind, e.data, e.created_at
  from public.live_events e
  where e.session_id = p_session_id and e.id > coalesce(p_after_id, 0)
  order by e.id asc limit 200;
$$;
grant execute on function public.live_poll(uuid, bigint) to anon, authenticated;
