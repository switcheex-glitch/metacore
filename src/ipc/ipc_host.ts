import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import type { IpcChannel } from "./ipc_types";

type Handler = (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown> | unknown;

const registered = new Set<IpcChannel>();

// ~25 MB cap per IPC payload (images are up to 20 MB + some overhead).
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;

function estimatePayloadSize(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "string") return v.length * 2;
  try {
    return JSON.stringify(v).length * 2;
  } catch {
    return 0;
  }
}

export function registerInvokeHandler(channel: IpcChannel, handler: Handler) {
  if (registered.has(channel)) {
    throw new Error(`IPC channel already registered: ${channel}`);
  }
  registered.add(channel);
  ipcMain.handle(channel, async (event, payload) => {
    if (estimatePayloadSize(payload) > MAX_PAYLOAD_BYTES) {
      throw new Error(`IPC payload too large on ${channel}`);
    }
    return handler(event, payload);
  });
}

export function safeSend(wc: WebContents | null | undefined, channel: IpcChannel, data: unknown) {
  if (!wc || wc.isDestroyed()) return;
  try {
    wc.send(channel, data);
  } catch {
    // window may be closing; swallow
  }
}

export async function registerAllHandlers(_wc?: WebContents) {
  const { registerSettingsHandlers } = await import("./handlers/settings_handlers");
  const { registerProviderHandlers } = await import("./handlers/provider_handlers");
  const { registerAppHandlers } = await import("./handlers/app_handlers");
  const { registerChatStreamHandlers } = await import("./handlers/chat_stream_handlers");
  const { registerVersionHandlers } = await import("./handlers/version_handlers");
  const { registerConsentHandlers } = await import("./handlers/consent_handlers");
  const { registerMcpHandlers } = await import("./handlers/mcp_handlers");
  const { registerGithubHandlers } = await import("./handlers/github_handlers");
  const { registerPromptsHandlers } = await import("./handlers/prompts_handlers");
  registerSettingsHandlers();
  registerProviderHandlers();
  registerAppHandlers();
  registerChatStreamHandlers();
  registerVersionHandlers();
  registerConsentHandlers();
  registerMcpHandlers();
  registerGithubHandlers();
  registerPromptsHandlers();
}
