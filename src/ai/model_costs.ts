const COST_TABLE: Record<string, number> = {
  "anthropic:claude-opus-4-7": 9,
  "openrouter:anthropic/claude-opus-4.7": 9,
  "openrouter:anthropic/claude-opus-4.6": 9,
  "anthropic:claude-sonnet-4-6": 5.4,
  "openrouter:anthropic/claude-sonnet-4.6": 5.4,
  "openrouter:google/gemini-3-pro-preview": 4.5,
  "openrouter:openai/gpt-5": 3.6,
  "openrouter:google/gemini-3-flash-preview": 1.2,
  "openrouter:moonshotai/kimi-k2": 1.2,
  "openrouter:minimax/minimax-m2": 1.2,
  "openrouter:z-ai/glm-4.5": 0.9,
  "openrouter:google/gemini-2.5-flash": 0.9,
  "openrouter:openai/gpt-5-mini": 0.75,
  "anthropic:claude-haiku-4-5-20251001": 1.2,
};

const DEFAULT_COST = 3;

export function getModelCost(modelId: string): number {
  return COST_TABLE[modelId] ?? DEFAULT_COST;
}
