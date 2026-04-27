import { useEffect, useState } from "react";
import { Download, RefreshCw, X, Loader2, AlertCircle } from "lucide-react";
import { invoke, subscribe } from "@/ipc/ipc_client";

type UpdateState =
  | { phase: "idle"; version: string }
  | { phase: "checking"; version: string }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; nextVersion: string | null }
  | { phase: "ready"; version: string; nextVersion: string | null }
  | { phase: "error"; version: string; reason: string };

export function UpdateBanner() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invoke<UpdateState>("update:status")
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {});
    const off = subscribe("update:state", (data) => {
      setState(data as UpdateState);
      setDismissed(false);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  if (!state || dismissed) return null;
  if (state.phase === "idle" || state.phase === "checking" || state.phase === "available") {
    return null;
  }

  if (state.phase === "downloading") {
    return (
      <Banner tone="info">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="flex-1">Скачиваю обновление Metacore…</span>
      </Banner>
    );
  }

  if (state.phase === "error") {
    return (
      <Banner tone="error" onDismiss={() => setDismissed(true)}>
        <AlertCircle className="h-4 w-4" />
        <span className="flex-1 truncate" title={state.reason}>
          Не удалось проверить обновления: {state.reason}
        </span>
      </Banner>
    );
  }

  // phase === "ready"
  return (
    <Banner tone="ready" onDismiss={() => setDismissed(true)}>
      <Download className="h-4 w-4" />
      <span className="flex-1">
        Доступно обновление{state.nextVersion ? ` — ${state.nextVersion}` : ""}.
      </span>
      <button
        type="button"
        disabled={installing}
        onClick={async () => {
          setInstalling(true);
          try {
            await invoke("update:install");
          } catch {
            setInstalling(false);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
      >
        {installing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Установить и перезапустить
      </button>
    </Banner>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "info" | "ready" | "error";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const cls =
    tone === "ready"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : tone === "error"
        ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
        : "border-white/10 bg-white/[0.04] text-white/80";
  return (
    <div className={`flex items-center gap-2 border-b px-4 py-2 text-xs ${cls}`}>
      {children}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 opacity-60 transition hover:bg-white/10 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
