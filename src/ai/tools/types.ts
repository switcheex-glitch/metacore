import type { z } from "zod";

export type ConsentDefault = "always" | "ask" | "never";

export type ToolConsentPreview = {
  summary: string;
  detail?: string;
};

export type ToolContext = {
  projectDir: string;
  appId: number;
  appSlug: string;
  chatId: number;
  streamId: string;
  signal: AbortSignal;
  requireConsent: (req: {
    toolName: string;
    toolDescription: string;
    preview: ToolConsentPreview | null;
    defaultConsent: ConsentDefault;
  }) => Promise<boolean>;
  readLogs: () => string[];
  setChatSummary: (summary: string) => void;
};

export type ToolDefinition<Input extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: Input;
  defaultConsent: ConsentDefault;
  readOnly: boolean;
  getConsentPreview?: (args: z.infer<Input>) => ToolConsentPreview | null;
  execute: (args: z.infer<Input>, ctx: ToolContext) => Promise<unknown>;
};

export type ToolRegistry = Record<string, ToolDefinition>;
