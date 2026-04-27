-- Fix: drop legacy 5-arg publish_app and 1-arg fork_public_app wrappers that
-- caused "column reference id is ambiguous" (42702). We keep only the full
-- versions with all parameters; Metacore always calls them with all args.

drop function if exists public.publish_app(text, text, text, text, jsonb);
drop function if exists public.fork_public_app(uuid);

-- Rebuild 7-arg publish_app with unambiguous return column.
drop function if exists public.publish_app(text, text, text, text, jsonb, bigint, text);
create function public.publish_app(
  p_key text,
  p_slug text,
  p_name text,
  p_description text,
  p_files jsonb,
  p_price_kopecks bigint default 0,
  p_category text default null
) returns table (id uuid)
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  combined text;
  bad text;
begin
  if p_key is null or length(p_key) < 8 then raise exception 'bad_key'; end if;
  if not exists (select 1 from public.metacore_keys mk where mk.key = p_key and mk.revoked_at is null) then
    raise exception 'bad_key';
  end if;
  if p_price_kopecks < 0 or p_price_kopecks > 100000000 then
    raise exception 'bad_price';
  end if;
  combined := lower(coalesce(p_name, '') || ' ' || coalesce(p_description, ''));
  bad := (select b from unnest(array[
    'хуй','хуе','хуё','хуи','пизд','ебат','ебан','ёбан','ебал','ёбал','бляд','блядь',
    'сука','суки','мудак','долбоёб','долбоеб','хуев','пидор','пидар','нахуй','манда',
    'fuck','shit','bitch','asshole','cunt','dick','faggot','nigger','nigga'
  ]) as b where combined ~* ('\m' || b || '\M') limit 1);
  if bad is not null then
    raise exception 'profanity_%', bad;
  end if;
  insert into public.public_apps (slug, name, description, author_key, files, price_kopecks, category)
    values (p_slug, p_name, p_description, p_key, p_files, p_price_kopecks, p_category)
    on conflict (slug) do update set
      name = excluded.name,
      description = excluded.description,
      files = excluded.files,
      price_kopecks = excluded.price_kopecks,
      category = excluded.category
    returning public_apps.id into new_id;
  id := new_id;
  return next;
end;
$$;
grant execute on function public.publish_app(text, text, text, text, jsonb, bigint, text) to anon, authenticated;

-- Rebuild 2-arg fork_public_app.
drop function if exists public.fork_public_app(uuid, text);
create function public.fork_public_app(
  p_app_id uuid,
  p_buyer_key text default null
) returns table (files jsonb, name text, ok boolean, reason text, price_kopecks bigint)
language plpgsql security definer set search_path = public as $$
declare
  row_app public.public_apps%rowtype;
  cur_balance bigint;
  author_share bigint;
begin
  select * into row_app from public.public_apps pa where pa.id = p_app_id;
  if not found then
    files := null::jsonb; name := null::text; ok := false; reason := 'not_found'; price_kopecks := 0;
    return next; return;
  end if;
  if row_app.price_kopecks > 0 then
    if p_buyer_key is null or not exists (select 1 from public.metacore_keys mk where mk.key = p_buyer_key and mk.revoked_at is null) then
      files := null::jsonb; name := null::text; ok := false; reason := 'bad_key'; price_kopecks := row_app.price_kopecks;
      return next; return;
    end if;
    if row_app.author_key = p_buyer_key then
      update public.public_apps set forks = forks + 1 where id = p_app_id;
      files := row_app.files; name := row_app.name; ok := true; reason := 'owner'; price_kopecks := row_app.price_kopecks;
      return next; return;
    end if;
    insert into public.wallets (key, balance_kopecks) values (p_buyer_key, 0) on conflict (key) do nothing;
    select w.balance_kopecks into cur_balance from public.wallets w where w.key = p_buyer_key for update;
    if cur_balance < row_app.price_kopecks then
      files := null::jsonb; name := null::text; ok := false; reason := 'insufficient_funds'; price_kopecks := row_app.price_kopecks;
      return next; return;
    end if;
    update public.wallets set balance_kopecks = balance_kopecks - row_app.price_kopecks, updated_at = now()
      where key = p_buyer_key;
    insert into public.wallet_transactions (key, kind, amount_kopecks, status, provider, metadata, completed_at)
      values (p_buyer_key, 'purchase', row_app.price_kopecks, 'completed', 'gallery',
              jsonb_build_object('app_id', p_app_id, 'item_name', row_app.name), now());
    if row_app.author_key is not null then
      author_share := (row_app.price_kopecks * 70) / 100;
      insert into public.author_earnings (author_key, item_id, buyer_key, gross_kopecks, author_kopecks)
        values (row_app.author_key, 'gallery:' || row_app.slug, p_buyer_key,
                row_app.price_kopecks, author_share);
    end if;
  end if;
  update public.public_apps set forks = forks + 1 where id = p_app_id;
  files := row_app.files; name := row_app.name; ok := true; reason := 'ok'; price_kopecks := row_app.price_kopecks;
  return next;
end;
$$;
grant execute on function public.fork_public_app(uuid, text) to anon, authenticated;
