import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel } from "./ipc/ipc_types";

const ALLOWED_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  "app:list",
  "app:create",
  "app:import",
  "app:pickFolder",
  "app:delete",
  "app:rename",
  "app:start",
  "app:stop",
  "app:restart",
  "app:status",
  "app:logs",
  "app:log",
  "app:event",
  "chat:list",
  "chat:create",
  "chat:default",
  "chat:delete",
  "chat:rename",
  "chat:messages",
  "chat:stream",
  "chat:abort",
  "chat:chunk",
  "chat:appSwitched",
  "app:listFiles",
  "app:readFile",
  "provider:list",
  "provider:upsert",
  "provider:setApiKey",
  "provider:connectClaude",
  "provider:models",
  "version:list",
  "version:detail",
  "version:revert",
  "version:undo",
  "consent:request",
  "consent:respond",
  "settings:get",
  "settings:set",
  "mcp:list",
  "mcp:upsert",
  "mcp:remove",
  "github:status",
  "github:connect",
  "github:disconnect",
  "github:push",
  "github:oauthStart",
  "github:oauthAwait",
  "github:oauthCancel",
  "deeplink:oauth-return",
  "window:minimize",
  "window:maximize",
  "window:close",
  "license:deviceId",
  "license:activate",
  "license:validate",
  "license:check",
  "wallet:get",
  "wallet:transactions",
  "wallet:topup",
  "wallet:charge",
  "hub:purchases",
  "threed:generate",
  "threed:genScene",
  "threed:saveToProject",
  "app:exportZip",
  "app:saveMemory",
  "video:getTranscript",
  "gallery:publish",
  "gallery:list",
  "gallery:fork",
  "gallery:unpublish",
  "earnings:list",
  "payout:balance",
  "payout:list",
  "payout:request",
  "supabase:query",
  "supabase:listTables",
  "supabase:listMigrations",
  "supabase:applyMigration",
  "live:create",
  "live:push",
  "live:poll",
  "preview:pencilToggle",
  "update:check",
  "update:install",
  "update:status",
  "update:state",
  "prompts:list",
  "prompts:upsert",
  "prompts:remove",
]);

function assertAllowed(channel: string): asserts channel is IpcChannel {
  if (!ALLOWED_CHANNELS.has(channel as IpcChannel)) {
    // Surface attempted IPC abuse to main-process logs for auditing.
    try {
      ipcRenderer.send("security:ipcViolation", { channel });
    } catch {
      // ignore
    }
    throw new Error(`IPC channel not allowed from renderer: ${channel}`);
  }
}

contextBridge.exposeInMainWorld("ipc", {
  invoke(channel: string, payload?: unknown) {
    assertAllowed(channel);
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel: string, listener: (data: unknown) => void) {
    assertAllowed(channel);
    const wrapped = (_event: unknown, data: unknown) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
});
