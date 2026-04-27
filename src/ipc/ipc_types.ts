import type { z } from "zod";

export type AppSummary = {
  id: number;
  name: string;
  slug: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type AppStatus = {
  running: boolean;
  port: number | null;
  url: string | null;
};

export type AppLogKind = "stdout" | "stderr" | "system";

export type AppLogEntry = {
  appSlug: string;
  kind: AppLogKind;
  line: string;
  ts: number;
};

export type AppRunnerEvent =
  | { type: "ready"; appSlug: string; url: string }
  | { type: "exit"; appSlug: string; code: number | null }
  | { type: "error-detected"; appSlug: string; message: string };

export type ChatSummary = {
  id: number;
  appId: number;
  title: string;
  createdAt: string;
};

export type ChatMode = "build" | "ask" | "agent" | "planning";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | string;

export type ModelOption = {
  id: string;
  providerId: ProviderId;
  displayName: string;
  maxOutputTokens: number;
  contextWindow: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
};

export type ChatAttachment =
  | { kind: "image"; name: string; mediaType: string; dataBase64: string }
  | { kind: "text"; name: string; content: string };

export type ChatStreamRequest = {
  chatId: number;
  prompt: string;
  mode: ChatMode;
  modelId: string;
  streamId: string;
  attachments?: ChatAttachment[];
  extraSystemPrompt?: string;
};

export type ChatStreamChunk =
  | { kind: "text-delta"; id: string; text: string }
  | { kind: "reasoning-delta"; id: string; text: string }
  | { kind: "tool-call"; id: string; name: string; args: unknown }
  | { kind: "tool-result"; id: string; name: string; result: unknown }
  | { kind: "error"; id: string; message: string }
  | { kind: "done"; id: string; commitHash?: string };

export type ChatAppSwitchedEvent = {
  chatId: number;
  appSlug: string;
  appName: string;
  appPath: string;
};

export type ConsentRequest = {
  id: string;
  toolName: string;
  toolDescription: string;
  inputPreview: string | null;
};

export type ConsentResponse = "accept-once" | "accept-always" | "decline";

export type IpcChannel =
  | "app:list"
  | "app:create"
  | "app:import"
  | "app:pickFolder"
  | "app:delete"
  | "app:rename"
  | "app:start"
  | "app:stop"
  | "app:restart"
  | "app:status"
  | "app:logs"
  | "app:log"
  | "app:event"
  | "chat:list"
  | "chat:create"
  | "chat:default"
  | "chat:delete"
  | "chat:rename"
  | "chat:messages"
  | "chat:stream"
  | "chat:abort"
  | "chat:chunk"
  | "chat:appSwitched"
  | "app:listFiles"
  | "app:readFile"
  | "provider:list"
  | "provider:upsert"
  | "provider:setApiKey"
  | "provider:connectClaude"
  | "provider:models"
  | "version:list"
  | "version:detail"
  | "version:revert"
  | "version:undo"
  | "consent:request"
  | "consent:respond"
  | "settings:get"
  | "settings:set"
  | "mcp:list"
  | "mcp:upsert"
  | "mcp:remove"
  | "github:status"
  | "github:connect"
  | "github:disconnect"
  | "github:push"
  | "github:oauthStart"
  | "github:oauthAwait"
  | "github:oauthCancel"
  | "deeplink:oauth-return"
  | "window:minimize"
  | "window:maximize"
  | "window:close"
  | "license:deviceId"
  | "license:activate"
  | "license:validate"
  | "license:check"
  | "wallet:get"
  | "wallet:transactions"
  | "wallet:topup"
  | "wallet:charge"
  | "hub:purchases"
  | "threed:generate"
  | "threed:genScene"
  | "threed:saveToProject"
  | "app:exportZip"
  | "app:saveMemory"
  | "video:getTranscript"
  | "gallery:publish"
  | "gallery:list"
  | "gallery:fork"
  | "gallery:unpublish"
  | "earnings:list"
  | "payout:balance"
  | "payout:list"
  | "payout:request"
  | "supabase:query"
  | "supabase:listTables"
  | "supabase:listMigrations"
  | "supabase:applyMigration"
  | "live:create"
  | "live:push"
  | "live:poll"
  | "preview:pencilToggle"
  | "update:check"
  | "update:install"
  | "update:status"
  | "update:state"
  | "prompts:list"
  | "prompts:upsert"
  | "prompts:remove";

export type ZodInfer<T extends z.ZodTypeAny> = z.infer<T>;

export type IpcApi = {
  invoke: <T = unknown>(channel: IpcChannel, payload?: unknown) => Promise<T>;
  on: (channel: IpcChannel, listener: (data: unknown) => void) => () => void;
};
