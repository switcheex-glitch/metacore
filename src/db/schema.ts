import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
};

export const apps = sqliteTable(
  "apps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    path: text("path").notNull(),
    githubOrg: text("github_org"),
    githubRepo: text("github_repo"),
    githubUser: text("github_user"),
    githubTokenEnc: text("github_token_enc"),
    supabaseProjectId: text("supabase_project_id"),
    neonProjectId: text("neon_project_id"),
    vercelProjectId: text("vercel_project_id"),
    installCommand: text("install_command").notNull().default("npm install"),
    startCommand: text("start_command").notNull().default("npm run dev"),
    chatContext: text("chat_context"),
    ...timestamps,
  },
  (t) => ({
    slugUnique: uniqueIndex("apps_slug_unique").on(t.slug),
  }),
);

export const chats = sqliteTable(
  "chats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    summary: text("summary"),
    compactedHistory: text("compacted_history"),
    compactedUntilMessageId: integer("compacted_until_message_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    byApp: index("chats_by_app").on(t.appId),
  }),
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
    content: text("content").notNull(),
    aiMessagesJson: text("ai_messages_json"),
    commitHash: text("commit_hash"),
    toolCalls: text("tool_calls"),
    toolResults: text("tool_results"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    byChat: index("messages_by_chat").on(t.chatId),
  }),
);

export const versions = sqliteTable(
  "versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    appId: integer("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    commitHash: text("commit_hash").notNull(),
    summary: text("summary"),
    neonSnapshotTimestamp: text("neon_snapshot_timestamp"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    byApp: index("versions_by_app").on(t.appId),
    appCommit: uniqueIndex("versions_app_commit_unique").on(t.appId, t.commitHash),
  }),
);

export const languageModelProviders = sqliteTable("language_model_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  apiBaseUrl: text("api_base_url"),
  envVarName: text("env_var_name"),
  authMode: text("auth_mode", { enum: ["api-key", "oauth", "local", "none"] })
    .notNull()
    .default("api-key"),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const languageModels = sqliteTable(
  "language_models",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => languageModelProviders.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull().default(8192),
    contextWindow: integer("context_window").notNull().default(128_000),
    supportsTools: integer("supports_tools", { mode: "boolean" }).notNull().default(true),
    supportsReasoning: integer("supports_reasoning", { mode: "boolean" }).notNull().default(false),
    isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull().default(false),
    pricingTier: text("pricing_tier"),
    ...timestamps,
  },
  (t) => ({
    byProvider: index("language_models_by_provider").on(t.providerId),
  }),
);

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  transport: text("transport", { enum: ["stdio", "http"] }).notNull(),
  command: text("command"),
  args: text("args"),
  env: text("env"),
  url: text("url"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const prompts = sqliteTable(
  "prompts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: text("tags"),
    ...timestamps,
  },
  (t) => ({
    byUpdated: index("prompts_by_updated").on(t.updatedAt),
  }),
);

export const mcpToolConsents = sqliteTable(
  "mcp_tool_consents",
  {
    mcpServerId: text("mcp_server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    consent: text("consent", { enum: ["always", "ask", "never"] }).notNull().default("ask"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    pk: uniqueIndex("mcp_tool_consents_pk").on(t.mcpServerId, t.toolName),
  }),
);

export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type LanguageModelProvider = typeof languageModelProviders.$inferSelect;
export type LanguageModel = typeof languageModels.$inferSelect;
export type McpServer = typeof mcpServers.$inferSelect;
export type McpToolConsent = typeof mcpToolConsents.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
