import type { WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { safeSend } from "@/ipc/ipc_host";
import type { ConsentResponse } from "@/ipc/ipc_types";
import { getSettings, updateSettings } from "./settings";
import type { ToolConsentPreview } from "@/ai/tools/types";

type PendingEntry = {
  id: string;
  toolName: string;
  resolve: (granted: boolean) => void;
};

const pending = new Map<string, PendingEntry>();
const sessionAccepted = new Map<string, Set<string>>();

function streamKey(streamId: string): Set<string> {
  let set = sessionAccepted.get(streamId);
  if (!set) {
    set = new Set();
    sessionAccepted.set(streamId, set);
  }
  return set;
}

function isAutoApproved(toolName: string, streamId: string): boolean {
  if (streamKey(streamId).has(toolName)) return true;
  const settings = getSettings();
  return Boolean(settings.autoApprovedMcpTools[toolName]);
}

export type ConsentRequestInput = {
  streamId: string;
  toolName: string;
  toolDescription: string;
  preview: ToolConsentPreview | null;
};

export async function requestConsent(
  wc: WebContents,
  input: ConsentRequestInput,
): Promise<boolean> {
  if (isAutoApproved(input.toolName, input.streamId)) return true;

  const id = randomUUID();
  const detail = input.preview?.detail ?? null;
  const inputPreview = input.preview
    ? detail
      ? `${input.preview.summary}\n\n${detail}`
      : input.preview.summary
    : null;

  const promise = new Promise<boolean>((resolve) => {
    pending.set(id, {
      id,
      toolName: input.toolName,
      resolve: (granted) => resolve(granted),
    });
  });

  safeSend(wc, "consent:request", {
    id,
    toolName: input.toolName,
    toolDescription: input.toolDescription,
    inputPreview,
  });

  return promise;
}

export function resolveConsent(
  id: string,
  response: ConsentResponse,
  streamId: string | null,
) {
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  if (response === "accept-once") {
    entry.resolve(true);
    return;
  }
  if (response === "accept-always") {
    if (streamId) streamKey(streamId).add(entry.toolName);
    const settings = getSettings();
    if (!settings.autoApprovedMcpTools[entry.toolName]) {
      updateSettings({
        autoApprovedMcpTools: {
          ...settings.autoApprovedMcpTools,
          [entry.toolName]: true,
        },
      });
    }
    entry.resolve(true);
    return;
  }
  entry.resolve(false);
}

export function declineAllPending(reason = "stream aborted") {
  for (const [id, entry] of pending) {
    pending.delete(id);
    entry.resolve(false);
  }
  void reason;
}

export function clearSessionAccepted(streamId: string) {
  sessionAccepted.delete(streamId);
}
