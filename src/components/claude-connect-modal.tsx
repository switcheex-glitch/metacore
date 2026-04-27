import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { useConnectClaude } from "@/hooks/use-providers";
import { useT } from "@/hooks/use-t";

const CONSOLE_URL = "https://console.anthropic.com/settings/keys";

export function ClaudeConnectModal({
  open,
  onClose,
  alreadyConnected,
}: {
  open: boolean;
  onClose: () => void;
  alreadyConnected: boolean;
}) {
  const t = useT();
  const connect = useConnectClaude();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successModels, setSuccessModels] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setError(null);
      setSuccessModels(null);
      connect.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function handleConnect() {
    setError(null);
    setSuccessModels(null);
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    try {
      const res = await connect.mutateAsync({ apiKey: trimmed });
      setSuccessModels(res.modelCount);
      setApiKey("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[92vw] rounded-xl border border-border bg-popover p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-rose-500/20 text-amber-400">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("claude.title")}</h2>
            <p className="truncate text-xs text-muted-foreground">api.anthropic.com</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">{t("claude.subtitle")}</p>

        {successModels !== null ? (
          <div className="mt-4 space-y-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-400">
              <CheckCircle2 className="h-4 w-4 flex-none" />
              {t("claude.connected", { n: String(successModels) })}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              OK
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <ol className="space-y-2 text-sm">
              <li className="flex items-baseline gap-2">
                <span className="flex-none text-muted-foreground">1.</span>
                <span className="text-muted-foreground">
                  {t("claude.step1")}{" "}
                  <a
                    href={CONSOLE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {t("claude.openConsole")} <ExternalLink className="h-3 w-3" />
                  </a>
                </span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="flex-none text-muted-foreground">2.</span>
                <span className="text-muted-foreground">{t("claude.step2")}</span>
              </li>
            </ol>

            <input
              type="password"
              autoFocus
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !connect.isPending && apiKey.trim()) {
                  e.preventDefault();
                  handleConnect();
                }
              }}
              placeholder={t("claude.placeholder")}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <div className="font-medium">{t("claude.invalidKey")}</div>
                <div className="mt-0.5 text-destructive/80">{error}</div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleConnect}
              disabled={connect.isPending || apiKey.trim().length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {connect.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("claude.validating")}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {alreadyConnected ? t("settings.replaceKey") : t("claude.connectBtn")}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
