// Supabase Edge Function: platega-webhook
// Handles Platega.io payment notifications. On successful payment — issues a
// Metacore key and stores it in metacore_keys.
// Deploy: supabase functions deploy platega-webhook --no-verify-jwt

import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const PLATEGA_SECRET = Deno.env.get("PLATEGA_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const raw = await req.text();

  const sig = req.headers.get("x-signature") ?? "";
  const altSecret = req.headers.get("x-secret") ?? "";
  const expected = await hmacHex(raw, PLATEGA_SECRET);
  const sigOk =
    (sig && timingSafeEq(sig.toLowerCase(), expected)) ||
    (altSecret && timingSafeEq(altSecret, PLATEGA_SECRET));
  if (!sigOk) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const status = String(payload.status ?? payload.state ?? "").toUpperCase();
  const orderId = String(payload.id ?? payload.orderId ?? "");
  const amount = Number(
    (payload.paymentDetails as Record<string, unknown> | undefined)?.amount ??
      payload.amount ??
      0,
  );
  const currency = String(
    (payload.paymentDetails as Record<string, unknown> | undefined)?.currency ??
      payload.currency ??
      "RUB",
  );

  let email = "";
  const rawPayload = payload.payload;
  if (typeof rawPayload === "string") {
    try {
      email = String((JSON.parse(rawPayload) as { email?: string })?.email ?? "").toLowerCase();
    } catch {
      // ignore
    }
  } else if (rawPayload && typeof rawPayload === "object") {
    email = String((rawPayload as { email?: string }).email ?? "").toLowerCase();
  }
  if (!email) email = String(payload.email ?? "").toLowerCase();

  if (!email) {
    return new Response("missing email in payload", { status: 400 });
  }

  const paid =
    status === "CONFIRMED" ||
    status === "SUCCESS" ||
    status === "PAID" ||
    status === "COMPLETED";

  await admin
    .from("payments")
    .upsert(
      {
        provider: "platega",
        contract_id: orderId || null,
        external_id: orderId || null,
        email,
        amount,
        currency,
        status,
        raw: payload,
        paid_at: paid ? new Date().toISOString() : null,
      },
      { onConflict: "provider,contract_id" },
    );

  if (!paid) {
    return new Response(JSON.stringify({ ok: true, paid: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: existing } = await admin
    .from("metacore_keys")
    .select("key")
    .eq("email", email)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  let keyToReturn = existing?.key as string | undefined;

  if (!keyToReturn) {
    const { data: inserted, error } = await admin
      .from("metacore_keys")
      .insert({ email, tier: "standard", tokens_limit: 200 })
      .select("key")
      .single();
    if (error) return new Response(`db error: ${error.message}`, { status: 500 });
    keyToReturn = inserted.key;
  }

  await admin
    .from("payments")
    .update({ key_issued: keyToReturn })
    .eq("provider", "platega")
    .eq("contract_id", orderId);

  return new Response(JSON.stringify({ ok: true, paid: true, key: keyToReturn }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
