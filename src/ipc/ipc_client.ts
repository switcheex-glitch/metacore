import type { IpcApi, IpcChannel } from "./ipc_types";

declare global {
  interface Window {
    ipc: IpcApi;
  }
}

export function invoke<T = unknown>(channel: IpcChannel, payload?: unknown): Promise<T> {
  return window.ipc.invoke<T>(channel, payload);
}

export function subscribe(channel: IpcChannel, listener: (data: unknown) => void): () => void {
  return window.ipc.on(channel, listener);
}
