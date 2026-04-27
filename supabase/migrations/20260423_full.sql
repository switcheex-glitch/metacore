-- Gallery + earnings + live sessions.

-- Public gallery
create table if not exists public.public_apps (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  author_key text references public.metacore_keys(key) on delete set null,
  files jsonb not null,
  forks int not null default 0,
  likes int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists public_apps_created_idx on public.public_apps (created_at desc);
alter table public.public_apps enable row level security;
drop policy if exists "read public apps" on public.public_apps;
drop policy if exists "deny writes on public apps" on public.public_apps;
create policy "read public apps" on public.public_apps for select using (true);
create policy "deny writes on public apps" on public.public_apps for all using (false) with check (false);

create or replace function public.publish_app(
  p_key text, p_slug text, p_name text, p_description text, p_files jsonb
) returns table (id uuid)
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if p_key is null or length(p_key) < 8 then raise exception 'bad_key'; end if;
  if not exists (select 1 from public.metacore_keys where key = p_key and revoked_at is null) then
    raise exception 'bad_key';
  end if;
  insert into public.public_apps (slug, name, description, author_key, files)
    values (p_slug, p_name, p_description, p_key, p_files)
    on conflict (slug) do update
      set name = excluded.name, description = excluded.description, files = excluded.files
    returning id into new_id;
  return query select new_id;
end;
$$;
grant execute on function public.publish_app(text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.fork_public_app(p_app_id uuid)
returns table (files jsonb, name text)
language plpgsql security definer set search_path = public as $$
begin
  update public.public_apps set forks = forks + 1 where id = p_app_id;
  return query
    select a.files, a.name from public.public_apps a where a.id = p_app_id;
end;
$$;
grant execute on function public.fork_public_app(uuid) to anon, authenticated;

-- Author earnings (70% from every purchase of their items)
create table if not exists public.author_earnings (
  id uuid primary key default gen_random_uuid(),
  author_key text not null references public.metacore_keys(key) on delete cascade,
  item_id text not null,
  buyer_key text not null,
  gross_kopecks bigint not null,
  author_kopecks bigint not null,
  status text not null default 'accrued' check (status in ('accrued','paid','canceled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists author_earnings_by_author on public.author_earnings (author_key, created_at desc);
alter table public.author_earnings enable row level security;
drop policy if exists "deny all on earnings" on public.author_earnings;
create policy "deny all on earnings" on public.author_earnings for all using (false) with check (false);

create or replace function public.list_my_earnings(p_key text)
returns table (
  id uuid, item_id text, gross_kopecks bigint, author_kopecks bigint,
  status text, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select e.id, e.item_id, e.gross_kopecks, e.author_kopecks, e.status, e.created_at
  from public.author_earnings e where e.author_key = p_key
  order by e.created_at desc limit 200;
$$;
grant execute on function public.list_my_earnings(text) to anon, authenticated;
