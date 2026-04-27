# Deployment — Metacore billing backend (Platega.io)

## Данные, которые нужны (у тебя уже есть)

- **Merchant ID**: `41a36513-a85b-4d9a-8fe2-b365eee04250`
- **API ключ** (Platega → Интеграция и API → API ключ — нажми «глаз» чтобы показать)
- **Callback URL** (пока пустой — заполним в шаге 5)
- **Supabase project ref**: `nsrilzwmclsiwtrsomer`
- **Webhook URL** (его сами формируем): `https://nsrilzwmclsiwtrsomer.supabase.co/functions/v1/platega-webhook`

## 1. SQL миграции
Supabase Dashboard → SQL Editor → прогнать по порядку все файлы из `supabase/migrations/` (если ещё не прогонял).

## 2. Supabase CLI (один раз)
```
npm i -g supabase
supabase login
supabase link --project-ref nsrilzwmclsiwtrsomer
```

## 3. Залить секреты на Supabase
Замени `<API_KEY_FROM_PLATEGA>` на ключ из скрина Platega (поле «API ключ»):
```
supabase secrets set PLATEGA_MERCHANT_ID=41a36513-a85b-4d9a-8fe2-b365eee04250
supabase secrets set PLATEGA_SECRET=<API_KEY_FROM_PLATEGA>
supabase secrets set PRICE_RUB=1999
supabase secrets set RETURN_URL=https://metacore.ltd/paid
supabase secrets set FAIL_URL=https://metacore.ltd/failed
```

## 4. Задеплоить функции
```
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy platega-webhook --no-verify-jwt
supabase functions deploy check-key       --no-verify-jwt
```

## 5. Прописать Callback URL в Platega
Platega → Настройки → Интеграция и API → **Callback URL**:
```
https://nsrilzwmclsiwtrsomer.supabase.co/functions/v1/platega-webhook
```
Нажать «Сохранить изменения».

## 6. Тест (end-to-end)
```
curl -X POST https://nsrilzwmclsiwtrsomer.supabase.co/functions/v1/create-checkout \
  -H "apikey: sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","paymentMethod":"CARD"}'
```
Ожидаемый ответ:
```json
{"paymentUrl":"https://app.platega.io/payment/...","orderId":"<uuid>","invoiceId":"<id>"}
```

## Как работает поток
1. В приложении пользователь жмёт «Купить ключ — 1999 ₽/мес» → открывается `BuyKeyModal`.
2. Вводит email → frontend дёргает `create-checkout` → та идёт в Platega `/transaction/process`.
3. Platega возвращает `redirect` URL → открываем в браузере, пользователь платит.
4. Platega шлёт POST на `platega-webhook` (подпись `x-signature` = HMAC-SHA256 от сырого тела на `PLATEGA_SECRET`, либо заголовок `x-secret` равный секрету).
5. `platega-webhook` проверяет подпись, upsert в `payments`, выдаёт ключ в `metacore_keys`.
6. Клиент раз в 3.5 сек опрашивает `check-key` по email → как только ключ появился, вызывает `license:activate` (IPC) — привязка ключа к устройству.

## Отладка
- Таблица `payments` — все попытки со статусами от Platega.
- Таблица `metacore_keys` — выданные ключи.
- Логи функций: Supabase Dashboard → Edge Functions → конкретная функция → Logs.
- Если webhook отвечает `401 Unauthorized` — Platega шлёт другой формат подписи. Проверь заголовки в логах и при необходимости поправь проверку в [functions/platega-webhook/index.ts](functions/platega-webhook/index.ts).
