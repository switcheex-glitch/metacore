-- Генерирует 100 свежих ключей с лимитом 200 токенов каждый.
-- Запускать в Supabase Dashboard → SQL Editor.
-- После выполнения список ключей будет выведен в результат запроса.

insert into public.metacore_keys (key, email, tier, tokens_limit)
select
  'mc_' || replace(gen_random_uuid()::text, '-', ''),
  'batch_' || i::text || '@metacore.local',
  'standard',
  200
from generate_series(1, 100) as g(i)
returning key, email, tokens_limit;
