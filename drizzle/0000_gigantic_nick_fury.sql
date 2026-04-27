CREATE TABLE `apps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`path` text NOT NULL,
	`github_org` text,
	`github_repo` text,
	`supabase_project_id` text,
	`neon_project_id` text,
	`vercel_project_id` text,
	`install_command` text DEFAULT 'npm install' NOT NULL,
	`start_command` text DEFAULT 'npm run dev' NOT NULL,
	`chat_context` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `apps_slug_unique` ON `apps` (`slug`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`summary` text,
	`compacted_history` text,
	`compacted_until_message_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chats_by_app` ON `chats` (`app_id`);--> statement-breakpoint
CREATE TABLE `language_model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_base_url` text,
	`env_var_name` text,
	`auth_mode` text DEFAULT 'api-key' NOT NULL,
	`is_built_in` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `language_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text NOT NULL,
	`max_output_tokens` integer DEFAULT 8192 NOT NULL,
	`context_window` integer DEFAULT 128000 NOT NULL,
	`supports_tools` integer DEFAULT true NOT NULL,
	`supports_reasoning` integer DEFAULT false NOT NULL,
	`is_built_in` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `language_model_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `language_models_by_provider` ON `language_models` (`provider_id`);--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transport` text NOT NULL,
	`command` text,
	`args` text,
	`env` text,
	`url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_tool_consents` (
	`mcp_server_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`consent` text DEFAULT 'ask' NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`mcp_server_id`) REFERENCES `mcp_servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tool_consents_pk` ON `mcp_tool_consents` (`mcp_server_id`,`tool_name`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`ai_messages_json` text,
	`commit_hash` text,
	`tool_calls` text,
	`tool_results` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_by_chat` ON `messages` (`chat_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`commit_hash` text NOT NULL,
	`summary` text,
	`neon_snapshot_timestamp` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `versions_by_app` ON `versions` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `versions_app_commit_unique` ON `versions` (`app_id`,`commit_hash`);