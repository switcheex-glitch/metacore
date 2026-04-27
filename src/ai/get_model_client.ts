import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelV1 } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { languageModels, languageModelProviders } from "@/db/schema";
import { getApiKey } from "@/main/settings";

export type ModelClient = {
  modelId: string;
  providerId: string;
  providerName: string;
  modelName: string;
  maxOutputTokens: number;
  contextWindow: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  model: LanguageModelV1;
};

export async function getModelClient(modelRowId: string): Promise<ModelClient> {
  const db = getDb();
  const rows = await db
    .select({
      model: languageModels,
      provider: languageModelProviders,
    })
    .from(languageModels)
    .innerJoin(languageModelProviders, eq(languageModels.providerId, languageModelProviders.id))
    .where(eq(languageModels.id, modelRowId))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error(`Model not found: ${modelRowId}`);
  const { model, provider } = row;

  const apiKey = getApiKey(provider.id) ?? "";
  const baseURL = provider.apiBaseUrl ?? undefined;

  let languageModel: LanguageModelV1;
  switch (provider.id) {
    case "openai": {
      if (!apiKey) throw new Error("OpenAI API key is not set");
      const factory = createOpenAI({ apiKey, baseURL });
      languageModel = factory.chat(model.name);
      break;
    }
    case "anthropic": {
      if (!apiKey) throw new Error("Anthropic API key is not set");
      const factory = createAnthropic({ apiKey, baseURL });
      languageModel = factory(model.name);
      break;
    }
    case "google": {
      if (!apiKey) throw new Error("Google Generative AI API key is not set");
      const factory = createGoogleGenerativeAI({ apiKey, baseURL });
      languageModel = factory(model.name);
      break;
    }
    case "ollama":
    case "lmstudio": {
      const factory = createOpenAI({
        apiKey: apiKey || "ollama",
        baseURL: baseURL ?? (provider.id === "ollama"
          ? "http://localhost:11434/v1"
          : "http://localhost:1234/v1"),
      });
      languageModel = factory.chat(model.name);
      break;
    }
    case "openrouter": {
      if (!apiKey) throw new Error("OpenRouter API key is not set");
      const factory = createOpenAI({
        apiKey,
        baseURL: baseURL ?? "https://openrouter.ai/api/v1",
      });
      languageModel = factory.chat(model.name);
      break;
    }
    default: {
      if (!baseURL) {
        throw new Error(`Provider ${provider.id} has no apiBaseUrl configured`);
      }
      const factory = createOpenAI({ apiKey: apiKey || "none", baseURL });
      languageModel = factory.chat(model.name);
    }
  }

  return {
    modelId: model.id,
    providerId: provider.id,
    providerName: provider.name,
    modelName: model.name,
    maxOutputTokens: model.maxOutputTokens,
    contextWindow: model.contextWindow,
    supportsTools: model.supportsTools,
    supportsReasoning: model.supportsReasoning,
    model: languageModel,
  };
}
