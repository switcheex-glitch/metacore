// Supabase Edge Function: gallery-unpublish
//
// Removes a row from public_apps after verifying the caller owns it.
// Auth: caller passes Metacore license key as Bearer token. We validate the
// key exists and is not revoked, then check public_apps.author_key matches.
//
// Deploy: supabase functions deploy gallery-unpublish --no-verify-jwt

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
  if (req.method !== "POST") {
    return jsonError("method not allowed", 405);
  }

  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const licenseKey = m ? m[1].trim() : "";
  if (!licenseKey) return jsonError("missing license key", 401);

  let body: { appId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid JSON", 400);
  }
  const appId = (body.appId ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId)) {
    return jsonError("appId must be a UUID", 400);
  }

  const { data: keyRow, error: keyErr } = await admin
    .from("metacore_keys")
    .select("key, revoked_at")
    .eq("key", licenseKey)
    .limit(1)
    .maybeSingle();
  if (keyErr) return jsonError(`license check failed: ${keyErr.message}`, 500);
  if (!keyRow) return jsonError("license key not found", 401);
  if (keyRow.revoked_at) return jsonError("license key revoked", 403);

  const { data: appRow, error: appErr } = await admin
    .from("public_apps")
    .select("id, author_key")
    .eq("id", appId)
    .limit(1)
    .maybeSingle();
  if (appErr) return jsonError(`app lookup failed: ${appErr.message}`, 500);
  if (!appRow) return jsonError("app not found", 404);
  if (appRow.author_key !== licenseKey) {
    return jsonError("you are not the author of this app", 403);
  }

  const { error: delErr } = await admin
    .from("public_apps")
    .delete()
    .eq("id", appId);
  if (delErr) return jsonError(`delete failed: ${delErr.message}`, 500);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
