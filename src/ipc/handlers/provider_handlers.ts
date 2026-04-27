import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { registerInvokeHandler } from "../ipc_host";
import { getDb } from "@/db";
import { languageModelProviders, languageModels } from "@/db/schema";
import { getSettings, hasApiKey, setApiKey, isBuiltInProvider } from "@/main/settings";
import type { LanguageModelProvider, LanguageModel } from "@/db/schema";

export type ProviderListItem = LanguageModelProvider & {
  hasKey: boolean;
  locked: boolean;
};

const upsertSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    apiBaseUrl: z.string().url().or(z.literal("")).nullable().optional(),
    envVarName: z.string().nullable().optional(),
    authMode: z.enum(["api-key", "oauth", "local", "none"]).default("api-key"),
  })
  .strict();

const setApiKeySchema = z
  .object({
    providerId: z.string().min(1),
    apiKey: z.string(),
  })
  .strict();

const connectClaudeSchema = z
  .object({
    apiKey: z.string().trim().min(10),
  })
  .strict();

async function validateAnthropicKey(apiKey: string): Promise<{
  ok: true;
  modelCount: number;
} | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { data?: unknown[] };
      return { ok: true, modelCount: Array.isArray(body.data) ? body.data.length : 0 };
    }
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      if (err?.error?.message) message = err.error.message;
    } catch {
      // body not JSON — keep generic message
    }
    return { ok: false, status: res.status, message };
  } catch (err) {
    return { ok: false, status: 0, message: (err as Error).message };
  }
}

const modelsQuerySchema = z
  .object({
    providerId: z.string().min(1).optional(),
  })
  .strict()
  .optional();

export function registerProviderHandlers() {
  registerInvokeHandler("provider:list", async (): Promise<ProviderListItem[]> => {
    const db = getDb();
    const rows = await db
      .select()
      .from(languageModelProviders)
      .orderBy(asc(languageModelProviders.name));
    const settings = getSettings();
    return rows.map((r) => {
      const locked = isBuiltInProvider(r.id);
      return {
        ...r,
        hasKey: locked ? hasApiKey(r.id) : Boolean(settings.providerApiKeys[r.id]),
        locked,
      };
    });
  });

  registerInvokeHandler("provider:upsert", async (_event, payload) => {
    const input = upsertSchema.parse(payload);
    if (isBuiltInProvider(input.id)) {
      throw new Error(`provider "${input.id}" is built-in and cannot be changed`);
    }
    const db = getDb();
    const existing = await db
      .select({ id: languageModelProviders.id })
      .from(languageModelProviders)
      .where(eq(languageModelProviders.id, input.id))
      .limit(1);

    const values = {
      id: input.id,
      name: input.name,
      apiBaseUrl: input.apiBaseUrl ?? null,
      envVarName: input.envVarName ?? null,
      authMode: input.authMode,
      isBuiltIn: false,
      enabled: true,
    };

    if (existing.length === 0) {
      await db.insert(languageModelProviders).values(values);
    } else {
      await db
        .update(languageModelProviders)
        .set({
          name: values.name,
          apiBaseUrl: values.apiBaseUrl,
          envVarName: values.envVarName,
          authMode: values.authMode,
        })
        .where(eq(languageModelProviders.id, input.id));
    }
    return { ok: true };
  });

  registerInvokeHandler("provider:setApiKey", (_event, payload) => {
    const { providerId, apiKey } = setApiKeySchema.parse(payload);
    if (isBuiltInProvider(providerId)) {
      throw new Error(`provider "${providerId}" is built-in and cannot be changed`);
    }
    setApiKey(providerId, apiKey);
    return { ok: true, hasKey: hasApiKey(providerId) };
  });

  registerInvokeHandler("provider:connectClaude", async (_event, payload) => {
    const { apiKey } = connectClaudeSchema.parse(payload);
    const result = await validateAnthropicKey(apiKey);
    if (!result.ok) {
      const hint =
        result.status === 401 || result.status === 403
          ? "Ключ отклонён Anthropic — проверь, что он скопирован полностью с console.anthropic.com."
          : result.status === 0
            ? "Нет сети до api.anthropic.com. Проверь подключение или прокси."
            : result.message;
      throw new Error(hint);
    }
    setApiKey("anthropic", apiKey);
    return { ok: true, hasKey: hasApiKey("anthropic"), modelCount: result.modelCount };
  });

  registerInvokeHandler("provider:models", async (_event, payload): Promise<LanguageModel[]> => {
    const args = modelsQuerySchema.parse(payload);
    const db = getDb();
    if (args?.providerId) {
      return db
        .select()
        .from(languageModels)
        .where(eq(languageModels.providerId, args.providerId))
        .orderBy(asc(languageModels.displayName));
    }
    return db.select().from(languageModels).orderBy(asc(languageModels.displayName));
  });
}
