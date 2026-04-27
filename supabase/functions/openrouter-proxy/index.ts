// Supabase Edge Function: openrouter-proxy
//
// Forwards requests from Metacore desktop app to OpenRouter, injecting the
// real OpenRouter API key (kept in OPENROUTER_API_KEY Supabase secret).
// Authentication: the desktop app sends `Authorization: Bearer <metacore_key>`.
// We validate the license key via metacore_keys table, then forward to
// openrouter.ai with our own bearer token.
//
// Streaming responses (SSE for /v1/chat/completions stream:true) are passed
// through verbatim without buffering.
//
// Deploy: supabase functions deploy openrouter-proxy --no-verify-jwt

import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OPENROUTER_BASE = "https://openrouter.ai/api";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  // Function is mounted at /functions/v1/openrouter-proxy. The desktop app
  // sets baseURL to .../openrouter-proxy/v1, so we need to strip the function
  // prefix and forward the remainder (e.g. /v1/chat/completions) to OpenRouter.
  const idx = url.pathname.indexOf("/openrouter-proxy");
  const subpath = idx >= 0 ? url.pathname.slice(idx + "/openrouter-proxy".length) : url.pathname;
  const target = `${OPENROUTER_BASE}${subpath}${url.search}`;

  // Extract Metacore license key from Authorization header.
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const licenseKey = m ? m[1].trim() : "";
  if (!licenseKey) {
    return jsonError("missing license key", 401);
  }

  // Validate license key.
  const { data: keyRow, error: keyErr } = await admin
    .from("metacore_keys")
    .select("key, revoked_at, tokens_limit")
    .eq("key", licenseKey)
    .limit(1)
    .maybeSingle();

  if (keyErr) return jsonError(`license check failed: ${keyErr.message}`, 500);
  if (!keyRow) return jsonError("license key not found", 401);
  if (keyRow.revoked_at) return jsonError("license key revoked", 403);

  // Build forwarded headers — drop hop-by-hop and our auth, inject OpenRouter token.
  const fwdHeaders = new Headers();
  for (const [name, value] of req.headers.entries()) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === "authorization") continue;
    if (lower === "apikey") continue;
    if (lower.startsWith("x-forwarded-")) continue;
    fwdHeaders.set(name, value);
  }
  fwdHeaders.set("Authorization", `Bearer ${OPENROUTER_API_KEY}`);
  // Optional but recommended by OpenRouter docs.
  fwdHeaders.set("HTTP-Referer", "https://metacore.ltd");
  fwdHeaders.set("X-Title", "Metacore");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: fwdHeaders,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      // @ts-ignore — Deno needs this to forward streaming bodies.
      duplex: "half",
    });
  } catch (e) {
    return jsonError(`upstream fetch failed: ${(e as Error).message}`, 502);
  }

  // Pass through status, headers, body (including SSE streams) verbatim.
  const respHeaders = new Headers();
  for (const [name, value] of upstream.headers.entries()) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue;
    respHeaders.set(name, value);
  }
  for (const [k, v] of Object.entries(corsHeaders())) {
    respHeaders.set(k, v);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-title, http-referer",
  };
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message, code: status } }), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}
