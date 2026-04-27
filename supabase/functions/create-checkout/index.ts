// Supabase Edge Function: create-checkout (Platega.io)
// Creates a payment order via Platega.io API and returns the redirect URL.
// Deploy: supabase functions deploy create-checkout --no-verify-jwt

import { serve } from "https://deno.land/std@0.220.0/http/server.ts";

const PLATEGA_MERCHANT_ID = Deno.env.get("PLATEGA_MERCHANT_ID")!;
const PLATEGA_SECRET = Deno.env.get("PLATEGA_SECRET")!;
const PLATEGA_BASE = Deno.env.get("PLATEGA_BASE") ?? "https://app.platega.io";
const PRICE_RUB = Number(Deno.env.get("PRICE_RUB") ?? "1999");
const RETURN_URL = Deno.env.get("RETURN_URL") ?? "https://metacore.ltd/paid";
const FAIL_URL = Deno.env.get("FAIL_URL") ?? "https://metacore.ltd/failed";

// Platega PaymentMethodInt enum (docs.platega.io → PaymentMethodInt):
// 2  — СБП (QR-код)
// 3  — ЕРИП
// 11 — Карточный эквайринг (RU cards)
// 12 — Международная оплата
// 13 — Криптовалюта
const PAYMENT_METHOD_MAP: Record<string, number> = {
  CARD: 11,
  SBP: 2,
  ERIP: 3,
  INTL: 12,
  CRYPTO: 13,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  let body: { email?: string; paymentMethod?: string | number };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON", 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return jsonError("email required", 400);
  }

  // Defaults to SBP (int 2) — broadly available for RU merchants.
  // Client can override via { paymentMethod: "CARD" | "SBP" | "ERIP" | "INTL" | "CRYPTO" }
  // or a raw integer from PaymentMethodInt enum.
  const rawMethod = body.paymentMethod ?? "SBP";
  const paymentMethodInt =
    typeof rawMethod === "number"
      ? rawMethod
      : PAYMENT_METHOD_MAP[String(rawMethod).toUpperCase()] ?? 2;

  const reqBody = {
    paymentMethod: paymentMethodInt,
    paymentDetails: {
      amount: PRICE_RUB,
      currency: "RUB",
    },
    description: "Metacore - 200 tokens - 1 month",
    return: RETURN_URL,
    failedUrl: FAIL_URL,
    payload: JSON.stringify({ email }),
  };

  const res = await fetch(`${PLATEGA_BASE}/transaction/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-MerchantId": PLATEGA_MERCHANT_ID,
      "X-Secret": PLATEGA_SECRET,
    },
    body: JSON.stringify(reqBody),
  });

  const text = await res.text();
  if (!res.ok) {
    return jsonError(`platega ${res.status}: ${text}`, 502);
  }

  let data: { redirect?: string; transactionId?: string; id?: string };
  try {
    data = JSON.parse(text);
  } catch {
    return jsonError("platega returned non-json", 502);
  }

  if (!data.redirect) {
    return jsonError("no redirect in platega response", 502);
  }

  const orderId = data.transactionId ?? data.id ?? "";

  return new Response(
    JSON.stringify({ paymentUrl: data.redirect, orderId, invoiceId: orderId }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
