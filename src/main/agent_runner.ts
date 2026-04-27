import { streamText, type CoreMessage } from "ai";
import type { WebContents } from "electron";
import { safeSend } from "@/ipc/ipc_host";
import type { ChatStreamChunk, ChatMode } from "@/ipc/ipc_types";
import { getModelClient } from "@/ai/get_model_client";
import { buildSystemPrompt, ensureAiRulesFile } from "@/ai/system_prompt";
import { sanitizeAssistantText } from "@/ai/sanitize_output";
import { buildAgentToolSet } from "@/ai/tools";
import type { ToolContext } from "@/ai/tools/types";
import { appendMessage, listMessages, updateMessageCommit } from "./chat_service";
import { gitAddAll, gitCommit, gitCurrentOid } from "./git_helpers";
import { recordVersion } from "./version_service";
import { requestConsent, clearSessionAccepted } from "./consent_service";
import { getRecentLogs } from "./app_runner";
import { openMcpClients, buildMcpToolSet, closeMcpClients } from "./mcp_service";
import { getSettings, updateSettings } from "./settings";
import { getModelCost } from "@/ai/model_costs";

export type AgentRunInput = {
  wc: WebContents;
  streamId: string;
  chatId: number;
  prompt: string;
  modelId: string;
  mode: Extract<ChatMode, "agent" | "ask">;
  abortSignal: AbortSignal;
  appSlug: string;
  appId: number;
  projectDir: string;
  imageAttachments?: Array<{ name: string; mediaType: string; dataBase64: string }>;
};

function sendChunk(wc: WebContents, chunk: ChatStreamChunk) {
  safeSend(wc, "chat:chunk", chunk);
}

export async function runAgentStream(input: AgentRunInput) {
  const {
    wc,
    streamId,
    chatId,
    prompt,
    modelId,
    mode,
    abortSignal,
    appSlug,
    appId,
    projectDir,
    imageAttachments,
  } = input;

  const cost = getModelCost(modelId);
  const pre = getSettings();
  if (pre.tokensUsed + cost > pre.tokensLimit) {
    sendChunk(wc, {
      kind: "error",
      id: streamId,
      message: `Лимит токенов исчерпан (${pre.tokensUsed}/${pre.tokensLimit}). Стоимость запроса: ${cost}.`,
    });
    sendChunk(wc, { kind: "done", id: streamId });
    return;
  }

  ensureAiRulesFile(projectDir);
  await appendMessage({ chatId, role: "user", content: prompt });

  const history = await listMessages(chatId);
  const coreMessages: CoreMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (imageAttachments && imageAttachments.length > 0 && coreMessages.length > 0) {
    const last = coreMessages[coreMessages.length - 1]!;
    if (last.role === "user") {
      coreMessages[coreMessages.length - 1] = {
        role: "user",
        content: [
          { type: "text", text: typeof last.content === "string" ? last.content : prompt },
          ...imageAttachments.map((a) => ({
            type: "image" as const,
            image: Buffer.from(a.dataBase64, "base64"),
            mimeType: a.mediaType,
          })),
        ],
      };
    }
  }
  const priorMessages = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => m.content);

  const client = await getModelClient(modelId);
  const system = buildSystemPrompt({
    mode,
    projectDir,
    userPrompt: prompt,
    priorMessages,
  });

  const startingOid = await gitCurrentOid(projectDir);
  let chatSummary: string | null = null;
  const capturedCalls: Array<{ name: string; args: unknown }> = [];
  const capturedResults: Array<{ name: string; result: unknown; error?: string }> = [];

  const toolCtx: ToolContext = {
    projectDir,
    appId,
    appSlug,
    chatId,
    streamId,
    signal: abortSignal,
    async requireConsent(req) {
      if (abortSignal.aborted) return false;
      return requestConsent(wc, {
        streamId,
        toolName: req.toolName,
        toolDescription: req.toolDescription,
        preview: req.preview,
      });
    },
    readLogs() {
      return getRecentLogs(appSlug).map((e) => e.line);
    },
    setChatSummary(summary) {
      chatSummary = summary.slice(0, 200);
    },
  };

  const mcpClients = await openMcpClients();
  const builtIn = buildAgentToolSet(toolCtx, { readOnly: mode === "ask" });
  const mcpTools = await buildMcpToolSet(toolCtx, mcpClients);
  const tools = { ...builtIn, ...mcpTools };

  let fullText = "";
  let totalTokens = 0;
  let streamResult: ReturnType<typeof streamText> | null = null;

  try {
    const result = streamText({
      model: client.model,
      system,
      messages: coreMessages,
      tools,
      maxSteps: 25,
      maxTokens: client.maxOutputTokens,
      abortSignal,
    });
    streamResult = result;

    for await (const rawPart of result.fullStream) {
      if (abortSignal.aborted) break;
      const part = rawPart as {
        type: string;
        textDelta?: string;
        toolName?: string;
        args?: unknown;
        result?: unknown;
        error?: unknown;
      };
      if (part.type === "text-delta") {
        const text = sanitizeAssistantText(part.textDelta ?? "");
        fullText += text;
        if (text) sendChunk(wc, { kind: "text-delta", id: streamId, text });
      } else if (part.type === "reasoning") {
        sendChunk(wc, { kind: "reasoning-delta", id: streamId, text: part.textDelta ?? "" });
      } else if (part.type === "tool-call") {
        const name = part.toolName ?? "(unknown)";
        capturedCalls.push({ name, args: part.args });
        sendChunk(wc, {
          kind: "tool-call",
          id: streamId,
          name,
          args: part.args,
        });
      } else if (part.type === "tool-result") {
        const name = part.toolName ?? "(unknown)";
        capturedResults.push({ name, result: part.result });
        sendChunk(wc, {
          kind: "tool-result",
          id: streamId,
          name,
          result: part.result,
        });
      } else if (part.type === "error") {
        const msg = part.error instanceof Error ? part.error.message : String(part.error);
        sendChunk(wc, { kind: "error", id: streamId, message: msg });
      }
    }
  } finally {
    await closeMcpClients(mcpClients);
  }

  if (streamResult) {
    try {
      const usage = await streamResult.usage;
      totalTokens = usage?.totalTokens ?? 0;
    } catch {
      // usage may not be resolved on abort — ignore
    }
  }

  void totalTokens;
  {
    const current = getSettings();
    updateSettings({ tokensUsed: current.tokensUsed + cost });
  }

  let commitHash: string | null = null;
  const hasMutatingCalls = capturedCalls.some((c) =>
    ["write_file", "edit_file", "search_replace", "delete_file", "rename_file", "add_dependency"].includes(
      c.name,
    ),
  );

  if (!abortSignal.aborted && mode === "agent" && hasMutatingCalls) {
    try {
      await gitAddAll(projectDir);
      const currentOid = await gitCurrentOid(projectDir);
      if (currentOid === startingOid || startingOid === null) {
        const summary =
          chatSummary ?? `Metacore: Agent turn — ${capturedCalls.length} tool call(s)`;
        const commit = await gitCommit(projectDir, summary);
        commitHash = commit.oid;
        await recordVersion(appId, commitHash, chatSummary);
      } else {
        commitHash = currentOid;
      }
    } catch (err) {
      sendChunk(wc, {
        kind: "error",
        id: streamId,
        message: `Failed to commit agent changes: ${(err as Error).message}`,
      });
    }
  }

  const prose = fullText.trim();
  const assistantContent =
    prose ||
    (capturedCalls.length > 0
      ? `Обновил файлов: ${capturedCalls.filter((c) => c.name === "write_file" || c.name === "edit_file").length}.`
      : "(нет ответа)");

  const assistantMsg = await appendMessage({
    chatId,
    role: "assistant",
    content: assistantContent,
    commitHash,
    toolCalls: JSON.stringify(capturedCalls),
    toolResults: JSON.stringify(capturedResults),
  });
  if (commitHash) await updateMessageCommit(assistantMsg.id, commitHash);

  clearSessionAccepted(streamId);
  sendChunk(wc, {
    kind: "done",
    id: streamId,
    commitHash: commitHash ?? undefined,
  });
}
