import { and, eq, inArray, notInArray } from "drizzle-orm";
import { languageModelProviders, languageModels } from "./schema";
import type { DrizzleDb } from "./index";

type SeedProvider = {
  id: string;
  name: string;
  apiBaseUrl: string | null;
  envVarName: string | null;
  authMode: "api-key" | "oauth" | "local" | "none";
};

type SeedModel = {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  maxOutputTokens: number;
  contextWindow: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  pricingTier: string | null;
};

const PROVIDERS: SeedProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    apiBaseUrl: "https://api.anthropic.com/v1",
    envVarName: "ANTHROPIC_API_KEY",
    authMode: "api-key",
  },
  {
    // Proxied through Metacore. The actual OpenRouter API key lives only on
    // Supabase secrets; the desktop app authenticates as the user's Metacore
    // license key, which the proxy validates before forwarding.
    id: "openrouter",
    name: "OpenRouter",
    apiBaseUrl:
      "https://nsrilzwmclsiwtrsomer.supabase.co/functions/v1/openrouter-proxy/v1",
    envVarName: null,
    authMode: "api-key",
  },
  {
    id: "ollama",
    name: "Ollama",
    apiBaseUrl: "http://localhost:11434",
    envVarName: null,
    authMode: "local",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    apiBaseUrl: "http://localhost:1234/v1",
    envVarName: null,
    authMode: "local",
  },
];

export const MODEL_OPTIONS: SeedModel[] = [
  // Anthropic — direct API (requires Anthropic API key, not OpenRouter)
  {
    id: "anthropic:claude-opus-4-7",
    providerId: "anthropic",
    name: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    maxOutputTokens: 16_384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$$",
  },
  {
    id: "anthropic:claude-sonnet-4-6",
    providerId: "anthropic",
    name: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    maxOutputTokens: 16_384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$",
  },
  {
    id: "anthropic:claude-haiku-4-5-20251001",
    providerId: "anthropic",
    name: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    maxOutputTokens: 8_192,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$$",
  },

  // OpenAI via OpenRouter
  {
    id: "openrouter:openai/gpt-5",
    providerId: "openrouter",
    name: "openai/gpt-5",
    displayName: "GPT 5",
    maxOutputTokens: 16_384,
    contextWindow: 400_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$",
  },
  {
    id: "openrouter:openai/gpt-5-mini",
    providerId: "openrouter",
    name: "openai/gpt-5-mini",
    displayName: "GPT 5 Mini",
    maxOutputTokens: 16_384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$$",
  },

  // Anthropic via OpenRouter
  {
    id: "openrouter:anthropic/claude-opus-4.7",
    providerId: "openrouter",
    name: "anthropic/claude-opus-4.7",
    displayName: "Claude Opus 4.7",
    maxOutputTokens: 16_384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$$",
  },
  {
    id: "openrouter:anthropic/claude-sonnet-4.6",
    providerId: "openrouter",
    name: "anthropic/claude-sonnet-4.6",
    displayName: "Claude Sonnet 4.6",
    maxOutputTokens: 16_384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$",
  },
  {
    id: "openrouter:anthropic/claude-opus-4.6",
    providerId: "openrouter",
    name: "anthropic/claude-opus-4.6",
    displayName: "Claude Opus 4.6",
    maxOutputTokens: 16_384,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$",
  },

  // Google via OpenRouter
  {
    id: "openrouter:google/gemini-3-pro-preview",
    providerId: "openrouter",
    name: "google/gemini-3-pro-preview",
    displayName: "Gemini 3 Pro (Preview)",
    maxOutputTokens: 16_384,
    contextWindow: 2_000_000,
    supportsTools: true,
    supportsReasoning: true,
    pricingTier: "$$$$",
  },
  {
    id: "openrouter:google/gemini-3-flash-preview",
    providerId: "openrouter",
    name: "google/gemini-3-flash-preview",
    displayName: "Gemini 3 Flash (Preview)",
    maxOutputTokens: 8_192,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$$",
  },
  {
    id: "openrouter:google/gemini-2.5-flash",
    providerId: "openrouter",
    name: "google/gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    maxOutputTokens: 8_192,
    contextWindow: 1_000_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$$",
  },

  // OpenRouter-native / 3rd-party
  {
    id: "openrouter:moonshotai/kimi-k2",
    providerId: "openrouter",
    name: "moonshotai/kimi-k2",
    displayName: "Kimi K2",
    maxOutputTokens: 8_192,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$$",
  },
  {
    id: "openrouter:z-ai/glm-4.5",
    providerId: "openrouter",
    name: "z-ai/glm-4.5",
    displayName: "GLM 4.5",
    maxOutputTokens: 8_192,
    contextWindow: 128_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$$",
  },
  {
    id: "openrouter:minimax/minimax-m2",
    providerId: "openrouter",
    name: "minimax/minimax-m2",
    displayName: "MiniMax M2",
    maxOutputTokens: 8_192,
    contextWindow: 200_000,
    supportsTools: true,
    supportsReasoning: false,
    pricingTier: "$",
  },

];

const CURATED_PROVIDER_IDS = Array.from(new Set(PROVIDERS.map((p) => p.id)));

export async function seedBuiltInProviders(db: DrizzleDb) {
  for (const p of PROVIDERS) {
    const existing = await db
      .select({ id: languageModelProviders.id })
      .from(languageModelProviders)
      .where(eq(languageModelProviders.id, p.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(languageModelProviders).values({
        id: p.id,
        name: p.name,
        apiBaseUrl: p.apiBaseUrl,
        envVarName: p.envVarName,
        authMode: p.authMode,
        isBuiltIn: true,
        enabled: true,
      });
    } else {
      // Refresh built-in metadata so changes in seed.ts (e.g. switching the
      // base URL to a proxy) propagate on next startup.
      await db
        .update(languageModelProviders)
        .set({
          name: p.name,
          apiBaseUrl: p.apiBaseUrl,
          envVarName: p.envVarName,
          authMode: p.authMode,
          isBuiltIn: true,
        })
        .where(eq(languageModelProviders.id, p.id));
    }
  }

  // Drop providers no longer offered in the curated list (e.g. standalone
  // OpenAI / Anthropic / Google rows from earlier seeds — OpenRouter now
  // proxies them). CASCADE on language_models.provider_id cleans their models.
  const providerIdsToKeep = PROVIDERS.map((p) => p.id);
  await db
    .delete(languageModelProviders)
    .where(
      and(
        eq(languageModelProviders.isBuiltIn, true),
        notInArray(languageModelProviders.id, providerIdsToKeep),
      ),
    );

  const curatedIds = MODEL_OPTIONS.map((m) => m.id);

  for (const m of MODEL_OPTIONS) {
    const existing = await db
      .select({ id: languageModels.id })
      .from(languageModels)
      .where(eq(languageModels.id, m.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(languageModels).values({ ...m, isBuiltIn: true });
    } else {
      await db
        .update(languageModels)
        .set({
          name: m.name,
          displayName: m.displayName,
          maxOutputTokens: m.maxOutputTokens,
          contextWindow: m.contextWindow,
          supportsTools: m.supportsTools,
          supportsReasoning: m.supportsReasoning,
          pricingTier: m.pricingTier,
          isBuiltIn: true,
          providerId: m.providerId,
        })
        .where(eq(languageModels.id, m.id));
    }
  }

  // Prune stale built-in rows across all curated providers.
  await db
    .delete(languageModels)
    .where(
      and(
        inArray(languageModels.providerId, CURATED_PROVIDER_IDS),
        notInArray(languageModels.id, curatedIds),
        eq(languageModels.isBuiltIn, true),
      ),
    );
}
