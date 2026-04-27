import { z } from "zod";
import { registerInvokeHandler } from "../ipc_host";
import { getPublicSettings, updateSettings } from "@/main/settings";
import { getDeviceFingerprint } from "@/main/device_fingerprint";

const SUPABASE_URL = "https://nsrilzwmclsiwtrsomer.supabase.co";
const SUPABASE_ANON = "sb_publishable_hwWGgZt8SK88_6ToeoKjtA_Sja5GyGM";

const activateSchema = z
  .object({ key: z.string().trim().min(8).max(128), email: z.string().trim().min(3).max(256) })
  .strict();

async function callRpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}`);
  return (await res.json()) as T;
}

const updatePatchSchema = z
  .object({
    enableAutoUpdate: z.boolean().optional(),
    releaseChannel: z.enum(["stable", "beta"]).optional(),
    defaultChatMode: z.enum(["build", "ask", "agent", "planning"]).optional(),
    telemetryOptIn: z.boolean().optional(),
    autoApprovedMcpTools: z.record(z.literal(true)).optional(),
    githubOAuthClientId: z.string().trim().max(128).nullable().optional(),
    supabaseUrl: z.string().trim().max(512).nullable().optional(),
    supabaseAnonKey: z.string().trim().max(2048).nullable().optional(),
    metacoreKey: z.string().trim().max(256).nullable().optional(),
    supabaseAccessToken: z.string().trim().max(512).nullable().optional(),
    supabaseProjectRef: z.string().trim().max(64).nullable().optional(),
    tokensUsed: z.number().int().min(0).optional(),
    tokensLimit: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export function registerSettingsHandlers() {
  registerInvokeHandler("settings:get", () => getPublicSettings());

  registerInvokeHandler("settings:set", (_event, payload) => {
    const patch = updatePatchSchema.parse(payload);
    updateSettings(patch);
    return getPublicSettings();
  });

  registerInvokeHandler("license:deviceId", () => ({ deviceId: getDeviceFingerprint() }));

  registerInvokeHandler("license:activate", async (_event, payload) => {
    const { key, email } = activateSchema.parse(payload);
    const deviceId = getDeviceFingerprint();
    const rows = await callRpc<Array<{ ok: boolean; reason: string }>>(
      "activate_metacore_key",
      { p_key: key, p_email: email, p_device_id: deviceId },
    );
    const row = rows[0];
    if (!row) throw new Error("no response from activate rpc");
    if (!row.ok) throw new Error(`activation failed: ${row.reason}`);
    updateSettings({ metacoreKey: key });
    return { ok: true, reason: row.reason };
  });

  registerInvokeHandler("license:validate", async () => {
    const s = getPublicSettings();
    if (!s.metacoreKey) return { valid: false, reason: "no_key" };
    const deviceId = getDeviceFingerprint();
    const rows = await callRpc<
      Array<{ valid: boolean; tier: string | null; tokens_limit: number; revoked: boolean; reason: string }>
    >("validate_metacore_key", { p_key: s.metacoreKey, p_device_id: deviceId });
    const row = rows[0];
    if (!row) return { valid: false, reason: "no_response" };
    if (row.reason === "revoked" || row.reason === "device_mismatch") {
      updateSettings({ metacoreKey: null });
    }
    return row;
  });

  const checkSchema = z.object({ key: z.string().trim().min(8).max(128) }).strict();
  registerInvokeHandler("license:check", async (_event, payload) => {
    const { key } = checkSchema.parse(payload);
    const deviceId = getDeviceFingerprint();
    const rows = await callRpc<
      Array<{ valid: boolean; tier: string | null; tokens_limit: number; revoked: boolean; reason: string }>
    >("validate_metacore_key", { p_key: key, p_device_id: deviceId });
    const row = rows[0];
    if (!row) return { valid: false, reason: "no_response" };
    return row;
  });

  function requireKey(): string {
    const s = getPublicSettings();
    if (!s.metacoreKey) throw new Error("no_key");
    return s.metacoreKey;
  }

  registerInvokeHandler("wallet:get", async () => {
    const key = requireKey();
    const rows = await callRpc<Array<{ balance_kopecks: number; currency: string }>>(
      "get_wallet",
      { p_key: key },
    );
    const row = rows[0] ?? { balance_kopecks: 0, currency: "RUB" };
    return { balanceKopecks: Number(row.balance_kopecks) || 0, currency: row.currency };
  });

  registerInvokeHandler("wallet:transactions", async (_event, payload) => {
    const key = requireKey();
    const p = (payload ?? {}) as { limit?: number };
    const rows = await callRpc<
      Array<{
        id: string;
        kind: string;
        amount_kopecks: number;
        status: string;
        provider: string | null;
        created_at: string;
        completed_at: string | null;
      }>
    >("list_wallet_transactions", { p_key: key, p_limit: p.limit ?? 50 });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amountKopecks: Number(r.amount_kopecks) || 0,
      status: r.status,
      provider: r.provider,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  });

  const topupSchema = z
    .object({ amountKopecks: z.number().int().min(10000).max(100000000) })
    .strict();
  registerInvokeHandler("wallet:topup", async (_event, payload) => {
    const key = requireKey();
    const { amountKopecks } = topupSchema.parse(payload);
    const rows = await callRpc<Array<{ tx_id: string; amount_kopecks: number }>>(
      "create_topup",
      { p_key: key, p_amount_kopecks: amountKopecks },
    );
    const row = rows[0];
    if (!row) throw new Error("create_topup_failed");
    // TODO: call Platega API to create a payment and return its pay URL.
    // When Platega credentials arrive, replace this stub with the real call
    // and forward the user to the returned payUrl. For now we just return the
    // tx id so the UI can poll.
    return { txId: row.tx_id, amountKopecks: Number(row.amount_kopecks), payUrl: null };
  });

  const chargeSchema = z
    .object({
      amountKopecks: z.number().int().min(1).max(100000000),
      itemId: z.string().trim().min(1).max(80),
      itemName: z.string().trim().min(1).max(120),
    })
    .strict();
  registerInvokeHandler("hub:purchases", async () => {
    const key = requireKey();
    const rows = await callRpc<Array<{ item_id: string; item_name: string; created_at: string }>>(
      "list_purchases",
      { p_key: key },
    ).catch(() => [] as Array<{ item_id: string; item_name: string; created_at: string }>);
    return rows.map((r) => ({
      itemId: r.item_id,
      itemName: r.item_name,
      createdAt: r.created_at,
    }));
  });

  registerInvokeHandler("wallet:charge", async (_event, payload) => {
    const key = requireKey();
    const { amountKopecks, itemId, itemName } = chargeSchema.parse(payload);
    const rows = await callRpc<
      Array<{ ok: boolean; reason: string; new_balance_kopecks: number }>
    >("charge_wallet", {
      p_key: key,
      p_amount_kopecks: amountKopecks,
      p_item_id: itemId,
      p_item_name: itemName,
    });
    const row = rows[0];
    if (!row) throw new Error("no_response");
    return {
      ok: row.ok,
      reason: row.reason,
      newBalanceKopecks: Number(row.new_balance_kopecks) || 0,
    };
  });
}
