// Supabase Edge Function: check-key
// Poll endpoint — returns the most recently issued Metacore key for an email.
// Deploy: supabase functions deploy check-key --no-verify-jwt

import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) {
    return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const { data, error } = await admin
    .from("metacore_keys")
    .select("key, tier, tokens_limit, created_at")
    .eq("email", email)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  return new Response(
    JSON.stringify(data ? { found: true, ...data } : { found: false }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  );
});
