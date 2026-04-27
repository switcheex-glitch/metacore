import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke, subscribe } from "@/ipc/ipc_client";
import type { Chat, Message } from "@/db/schema";
import type { ChatAttachment, ChatMode, ChatStreamChunk } from "@/ipc/ipc_types";

export function useChats(appSlug: string | undefined) {
  return useQuery<Chat[]>({
    queryKey: ["chats", appSlug],
    queryFn: () => invoke<Chat[]>("chat:list", { appSlug }),
    enabled: Boolean(appSlug),
  });
}

export function useDefaultChat(appSlug: string | undefined) {
  return useQuery<Chat>({
    queryKey: ["default-chat", appSlug],
    queryFn: () => invoke<Chat>("chat:default", { appSlug }),
    enabled: Boolean(appSlug),
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { appSlug: string; title?: string }) =>
      invoke<Chat>("chat:create", input),
    onSuccess: (_chat, { appSlug }) => {
      qc.invalidateQueries({ queryKey: ["chats", appSlug] });
    },
  });
}

export function useRenameChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { chatId: number; title: string }) =>
      invoke<{ ok: true }>("chat:rename", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chats"] }),
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chatId: number) => invoke<{ ok: true }>("chat:delete", { chatId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chats"] }),
  });
}

export function useMessages(chatId: number | undefined) {
  return useQuery<Message[]>({
    queryKey: ["messages", chatId],
    queryFn: () => invoke<Message[]>("chat:messages", { chatId }),
    enabled: Boolean(chatId),
  });
}

export type StreamedTool = {
  name: string;
  args: unknown;
  result?: unknown;
  error?: string;
};

export type StreamingState = {
  streamId: string | null;
  draft: string;
  reasoning: string;
  error: string | null;
  tools: StreamedTool[];
};

function rid(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useChatStream(chatId: number | undefined) {
  const qc = useQueryClient();
  const [state, setState] = useState<StreamingState>({
    streamId: null,
    draft: "",
    reasoning: "",
    error: null,
    tools: [],
  });
  const streamIdRef = useRef<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const send = useCallback(
    async (input: {
      prompt: string;
      modelId: string;
      mode: ChatMode;
      attachments?: ChatAttachment[];
      extraSystemPrompt?: string;
    }) => {
      if (!chatId) throw new Error("No active chat");
      if (streamIdRef.current) throw new Error("Stream already in progress");

      const id = rid();
      streamIdRef.current = id;
      setState({ streamId: id, draft: "", reasoning: "", error: null, tools: [] });

      unsubRef.current = subscribe("chat:chunk", (data) => {
        const chunk = data as ChatStreamChunk;
        if (chunk.id !== id) return;
        setState((prev) => {
          if (prev.streamId !== id) return prev;
          switch (chunk.kind) {
            case "text-delta":
              return { ...prev, draft: prev.draft + chunk.text };
            case "reasoning-delta":
              return { ...prev, reasoning: prev.reasoning + chunk.text };
            case "tool-call":
              return {
                ...prev,
                tools: [...prev.tools, { name: chunk.name, args: chunk.args }],
              };
            case "tool-result": {
              const tools = [...prev.tools];
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i]!.name === chunk.name && tools[i]!.result === undefined) {
                  tools[i] = { ...tools[i]!, result: chunk.result };
                  break;
                }
              }
              return { ...prev, tools };
            }
            case "error":
              return { ...prev, error: chunk.message };
            case "done":
              return { streamId: null, draft: "", reasoning: "", error: prev.error, tools: [] };
            default:
              return prev;
          }
        });

        if (chunk.kind === "done") {
          streamIdRef.current = null;
          cleanup();
          qc.invalidateQueries({ queryKey: ["messages", chatId] });
          qc.invalidateQueries({ queryKey: ["versions"] });
          qc.invalidateQueries({ queryKey: ["settings"] });
        }
      });

      qc.invalidateQueries({ queryKey: ["messages", chatId] });

      await invoke("chat:stream", {
        chatId,
        prompt: input.prompt,
        modelId: input.modelId,
        mode: input.mode,
        streamId: id,
        attachments: input.attachments,
        extraSystemPrompt: input.extraSystemPrompt,
      });
    },
    [chatId, cleanup, qc],
  );

  const abort = useCallback(async () => {
    const id = streamIdRef.current;
    if (!id) return;
    await invoke("chat:abort", { streamId: id });
    streamIdRef.current = null;
    cleanup();
    setState({ streamId: null, draft: "", reasoning: "", error: null, tools: [] });
  }, [cleanup]);

  return { ...state, send, abort, streaming: Boolean(state.streamId) };
}
