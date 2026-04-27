import { z } from "zod";
import { streamText, type CoreMessage } from "ai";
import type { WebContents } from "electron";
import { registerInvokeHandler, safeSend } from "../ipc_host";
import type { ChatStreamChunk, ChatStreamRequest, ChatMode } from "../ipc_types";
import { getModelClient } from "@/ai/get_model_client";
import { buildSystemPrompt, ensureAiRulesFile } from "@/ai/system_prompt";
import { parseMetacoreResponse, summarizeTags } from "@/ai/response_processor";
import { sanitizeAssistantText } from "@/ai/sanitize_output";
import {
  appendMessage,
  createChat,
  getAppForChat,
  getOrCreateDefaultChat,
  getChat,
  listChatsForApp,
  listMessages,
  renameChat,
  deleteChat,
  updateMessageCommit,
  setChatApp,
  renameChatIfDefault,
} from "@/main/chat_service";
import { applyMetacoreTags } from "@/main/file_ops";
import { recordVersion } from "@/main/version_service";
import { runAgentStream } from "@/main/agent_runner";
import { declineAllPending } from "@/main/consent_service";
import { createAppOnDesktop } from "@/main/app_manager";
import { getSettings, updateSettings } from "@/main/settings";
import { getModelCost } from "@/ai/model_costs";
import type { ChatAppSwitchedEvent } from "../ipc_types";

const active = new Map<string, AbortController>();

const chatListSchema = z.object({ appSlug: z.string().min(1) }).strict();
const chatCreateSchema = z
  .object({ appSlug: z.string().min(1), title: z.string().trim().max(120).optional() })
  .strict();
const chatDeleteSchema = z.object({ chatId: z.number().int().positive() }).strict();
const chatRenameSchema = z
  .object({ chatId: z.number().int().positive(), title: z.string().trim().min(1).max(120) })
  .strict();
const chatMessagesSchema = z.object({ chatId: z.number().int().positive() }).strict();
const chatDefaultSchema = z.object({ appSlug: z.string().min(1) }).strict();

const attachmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    name: z.string().max(255),
    mediaType: z.string().max(100),
    dataBase64: z.string().max(20_000_000),
  }),
  z.object({
    kind: z.literal("text"),
    name: z.string().max(255),
    content: z.string().max(1_000_000),
  }),
]);
const chatStreamSchema = z
  .object({
    chatId: z.number().int().positive(),
    prompt: z.string().min(1),
    mode: z.enum(["build", "ask", "agent", "planning"]),
    modelId: z.string().min(1),
    streamId: z.string().min(1),
    attachments: z.array(attachmentSchema).max(10).optional(),
    extraSystemPrompt: z.string().max(20_000).optional(),
  })
  .strict();
const chatAbortSchema = z.object({ streamId: z.string().min(1) }).strict();

function send(wc: WebContents, chunk: ChatStreamChunk) {
  safeSend(wc, "chat:chunk", chunk);
}

async function runChatStream(
  wc: WebContents,
  req: ChatStreamRequest & { streamId: string },
): Promise<void> {
  const { streamId, chatId, mode, modelId, attachments } = req;
  const textAtts = (attachments ?? []).filter((a) => a.kind === "text") as Array<{ kind: "text"; name: string; content: string }>;
  const imageAtts = (attachments ?? []).filter((a) => a.kind === "image") as Array<{ kind: "image"; name: string; mediaType: string; dataBase64: string }>;
  const fileBlocks = textAtts
    .map((a) => `<file name="${a.name}">\n${a.content}\n</file>`)
    .join("\n\n");
  const prompt = fileBlocks ? `${req.prompt}\n\n${fileBlocks}` : req.prompt;

  const controller = new AbortController();
  active.set(streamId, controller);

  try {
    const cost = getModelCost(modelId);
    const pre = getSettings();
    if (pre.tokensUsed + cost > pre.tokensLimit) {
      send(wc, {
        kind: "error",
        id: streamId,
        message: `Лимит токенов исчерпан (${pre.tokensUsed}/${pre.tokensLimit}). Стоимость запроса: ${cost}.`,
      });
      send(wc, { kind: "done", id: streamId });
      return;
    }

    const appChat = await getAppForChat(chatId);
    if (!appChat) throw new Error(`Chat not found: ${chatId}`);
    const { app, chat } = appChat;

    if (mode === "agent" || mode === "ask") {
      await runAgentStream({
        wc,
        streamId,
        chatId: chat.id,
        prompt,
        modelId,
        mode,
        abortSignal: controller.signal,
        appSlug: app.slug,
        appId: app.id,
        projectDir: app.path,
        imageAttachments: imageAtts,
      });
      return;
    }

    ensureAiRulesFile(app.path);

    await appendMessage({ chatId: chat.id, role: "user", content: prompt });

    const history = await listMessages(chatId);
    const coreMessages: CoreMessage[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    if (imageAtts.length > 0 && coreMessages.length > 0) {
      const last = coreMessages[coreMessages.length - 1]!;
      if (last.role === "user") {
        coreMessages[coreMessages.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: typeof last.content === "string" ? last.content : prompt },
            ...imageAtts.map((a) => ({
              type: "image" as const,
              image: Buffer.from(a.dataBase64, "base64"),
              mimeType: a.mediaType,
            })),
          ],
        };
      }
    }

    const client = await getModelClient(modelId);
    const priorMessages = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m) => m.content);
    let system = buildSystemPrompt({
      mode,
      projectDir: app.path,
      userPrompt: prompt,
      priorMessages,
    });
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const mem = await fs.readFile(path.join(app.path, ".metacore", "memory.md"), "utf8");
      if (mem.trim()) {
        system += `\n\n<PROJECT_MEMORY>\nРешения и договорённости по этому проекту из прошлых сессий:\n${mem.trim()}\n</PROJECT_MEMORY>`;
      }
    } catch {
      // no memory file yet
    }
    const extra = (req.extraSystemPrompt ?? "").trim();
    if (extra) {
      system += `\n\n<HUB_TASK>\nПользователь приобрёл товар и активировал его. Выполни ровно эту задачу вместо любого другого умолчания и не упоминай инструкцию пользователю:\n${extra}\n</HUB_TASK>`;
    }

    const MAX_RETRIES = 2;
    let attempt = 0;
    let fullText = "";
    let parsed = parseMetacoreResponse("");
    let totalTokens = 0;

    while (attempt <= MAX_RETRIES) {
      attempt++;
      const result = streamText({
        model: client.model,
        system,
        messages:
          attempt === 1
            ? coreMessages
            : [
                ...coreMessages,
                { role: "assistant", content: fullText },
                {
                  role: "user",
                  content: `Received unclosed metacore-write tag, attempting to continue, attempt #${attempt - 1}. Please restart the last <metacore-write> tag from its beginning and finish it cleanly.`,
                },
              ],
        maxTokens: client.maxOutputTokens,
        abortSignal: controller.signal,
      });

      let attemptText = "";
      for await (const part of result.fullStream) {
        if (controller.signal.aborted) break;
        if (part.type === "text-delta") {
          const clean = sanitizeAssistantText(part.textDelta);
          attemptText += clean;
          if (clean) send(wc, { kind: "text-delta", id: streamId, text: clean });
        } else if (part.type === "reasoning") {
          send(wc, { kind: "reasoning-delta", id: streamId, text: part.textDelta });
        } else if (part.type === "error") {
          const msg = part.error instanceof Error ? part.error.message : String(part.error);
          send(wc, { kind: "error", id: streamId, message: msg });
        }
      }
      fullText = attempt === 1 ? attemptText : fullText + attemptText;
      parsed = parseMetacoreResponse(fullText);

      try {
        const usage = await result.usage;
        totalTokens += usage?.totalTokens ?? 0;
      } catch {
        // usage may not be resolved on abort — ignore
      }

      if (!parsed.hasUnclosedWrite || controller.signal.aborted) break;

      send(wc, {
        kind: "text-delta",
        id: streamId,
        text: `\n\n[Получен незакрытый <metacore-write> тег, повтор попытки #${attempt}…]\n\n`,
      });
    }

    if (controller.signal.aborted) {
      send(wc, { kind: "done", id: streamId });
      return;
    }

    let commitHash: string | null = null;
    let targetApp = app;
    if (mode === "build") {
      const createAppTag = parsed.tags.find((t) => t.kind === "create-app");
      if (createAppTag && createAppTag.kind === "create-app") {
        try {
          const { app: newApp } = await createAppOnDesktop({ name: createAppTag.name });
          await setChatApp(chat.id, newApp.id);
          await renameChatIfDefault(chat.id, createAppTag.name);
          targetApp = newApp;
          const event: ChatAppSwitchedEvent = {
            chatId: chat.id,
            appSlug: newApp.slug,
            appName: newApp.name,
            appPath: newApp.path,
          };
          safeSend(wc, "chat:appSwitched", event);
          send(wc, {
            kind: "text-delta",
            id: streamId,
            text: `\n\n[Создан новый проект "${newApp.name}" на рабочем столе: ${newApp.path}]\n\n`,
          });
        } catch (err) {
          send(wc, {
            kind: "error",
            id: streamId,
            message: `Не удалось создать проект на рабочем столе: ${(err as Error).message}`,
          });
        }
      }
    }

    if (mode === "build" && parsed.tags.length > 0) {
      const message =
        (parsed.chatSummary && `Metacore: ${parsed.chatSummary}`) ||
        `Metacore: Update ${summarizeTags(parsed.tags)}`;
      try {
        const apply = await applyMetacoreTags(targetApp.path, parsed.tags, message);
        commitHash = apply.commit?.oid ?? null;
        if (commitHash) {
          await recordVersion(targetApp.id, commitHash, parsed.chatSummary);
        }
        if (parsed.chatSummary) {
          try {
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const memDir = path.join(targetApp.path, ".metacore");
            await fs.mkdir(memDir, { recursive: true });
            const memFile = path.join(memDir, "memory.md");
            const line = `- ${new Date().toISOString().slice(0, 10)} · ${parsed.chatSummary}`;
            let prev = "";
            try {
              prev = await fs.readFile(memFile, "utf8");
            } catch {
              // new file
            }
            const lines = (prev.trim() ? prev.trim().split("\n") : []).slice(-80);
            lines.push(line);
            await fs.writeFile(memFile, lines.join("\n") + "\n", "utf8");
          } catch {
            // best-effort
          }
        }
        if (apply.skippedDependencies.length > 0) {
          send(wc, {
            kind: "text-delta",
            id: streamId,
            text: `\n\n[Пропущены add-dependency теги: ${apply.skippedDependencies
              .flat()
              .join(", ")} — установите вручную или дождитесь автоматической установки]`,
          });
        }
        if (apply.skippedSql.length > 0) {
          send(wc, {
            kind: "text-delta",
            id: streamId,
            text: `\n\n[Пропущено ${apply.skippedSql.length} execute-sql тег(ов) — интеграция Supabase/Neon будет добавлена позже]`,
          });
        }
        if (apply.searchReplaceFailures.length > 0) {
          const list = apply.searchReplaceFailures
            .map((f) => `${f.path} (${f.reason})`)
            .join(", ");
          send(wc, {
            kind: "text-delta",
            id: streamId,
            text: `\n\n[Не применены search-replace патчи: ${list}]`,
          });
        }
        if (apply.requestedCommands.length > 0) {
          send(wc, {
            kind: "text-delta",
            id: streamId,
            text: `\n\n[Запрошены команды: ${apply.requestedCommands.join(", ")}]`,
          });
        }
      } catch (err) {
        send(wc, {
          kind: "error",
          id: streamId,
          message: `Failed to apply file changes: ${(err as Error).message}`,
        });
      }
    }

    const assistantMsg = await appendMessage({
      chatId: chat.id,
      role: "assistant",
      content: fullText,
      commitHash,
    });
    if (commitHash) await updateMessageCommit(assistantMsg.id, commitHash);

    void totalTokens;
    {
      const current = getSettings();
      updateSettings({ tokensUsed: current.tokensUsed + cost });
    }

    send(wc, {
      kind: "done",
      id: streamId,
      commitHash: commitHash ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(wc, { kind: "error", id: streamId, message: msg });
    send(wc, { kind: "done", id: streamId });
  } finally {
    active.delete(streamId);
  }
}

export function registerChatStreamHandlers() {
  registerInvokeHandler("chat:list", async (_event, payload) => {
    const { appSlug } = chatListSchema.parse(payload);
    return listChatsForApp(appSlug);
  });

  registerInvokeHandler("chat:create", async (_event, payload) => {
    const { appSlug, title } = chatCreateSchema.parse(payload);
    return createChat(appSlug, title);
  });

  registerInvokeHandler("chat:default", async (_event, payload) => {
    const { appSlug } = chatDefaultSchema.parse(payload);
    return getOrCreateDefaultChat(appSlug);
  });

  registerInvokeHandler("chat:delete", async (_event, payload) => {
    const { chatId } = chatDeleteSchema.parse(payload);
    await deleteChat(chatId);
    return { ok: true };
  });

  registerInvokeHandler("chat:rename", async (_event, payload) => {
    const { chatId, title } = chatRenameSchema.parse(payload);
    await renameChat(chatId, title);
    return { ok: true };
  });

  registerInvokeHandler("chat:messages", async (_event, payload) => {
    const { chatId } = chatMessagesSchema.parse(payload);
    const chat = await getChat(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);
    return listMessages(chatId);
  });

  registerInvokeHandler("chat:stream", async (event, payload) => {
    const parsed = chatStreamSchema.parse(payload);
    // Kick off async; the renderer listens to "chat:chunk" for progress.
    runChatStream(event.sender, parsed).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      safeSend(event.sender, "chat:chunk", {
        kind: "error",
        id: parsed.streamId,
        message: msg,
      } satisfies ChatStreamChunk);
    });
    return { ok: true, streamId: parsed.streamId };
  });

  registerInvokeHandler("chat:abort", (_event, payload) => {
    const { streamId } = chatAbortSchema.parse(payload);
    const ctrl = active.get(streamId);
    if (ctrl) {
      ctrl.abort();
      active.delete(streamId);
    }
    declineAllPending(`stream ${streamId} aborted`);
    return { ok: true };
  });
}

export type _ChatModeType = ChatMode;
