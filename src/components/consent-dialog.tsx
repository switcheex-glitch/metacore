import { useEffect, useState } from "react";
import { ShieldAlert, Check, CheckCheck, X } from "lucide-react";
import { invoke, subscribe } from "@/ipc/ipc_client";
import type { ConsentRequest, ConsentResponse } from "@/ipc/ipc_types";

export function ConsentDialogHost() {
  const [queue, setQueue] = useState<ConsentRequest[]>([]);

  useEffect(() => {
    const off = subscribe("consent:request", (data) => {
      setQueue((prev) => [...prev, data as ConsentRequest]);
    });
    return () => off();
  }, []);

  const current = queue[0] ?? null;

  async function respond(response: ConsentResponse) {
    if (!current) return;
    try {
      await invoke("consent:respond", { id: current.id, response });
    } finally {
      setQueue((prev) => prev.slice(1));
    }
  }

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Agent wants to run a tool</div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              {current.toolName}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{current.toolDescription}</p>
            {current.inputPreview ? (
              <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[11px] text-foreground">
                {current.inputPreview}
              </pre>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => respond("decline")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
            Decline
          </button>
          <button
            type="button"
            onClick={() => respond("accept-once")}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" />
            Accept once
          </button>
          <button
            type="button"
            onClick={() => respond("accept-always")}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Always allow
          </button>
        </div>
      </div>
    </div>
  );
}
