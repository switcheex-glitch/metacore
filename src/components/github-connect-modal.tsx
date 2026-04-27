import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Github,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  useAwaitOAuthGithub,
  useCancelOAuthGithub,
  useConnectGithub,
  useDisconnectGithub,
  useGithubStatus,
  usePushGithub,
  useStartOAuthGithub,
  type OAuthStartResult,
} from "@/hooks/use-github";
import { useSettings } from "@/hooks/use-providers";
import { useT } from "@/hooks/use-t";

export function GithubConnectModal({
  open,
  onClose,
  appSlug,
}: {
  open: boolean;
  onClose: () => void;
  appSlug: string;
}) {
  const t = useT();
  const status = useGithubStatus(open ? appSlug : undefined);
  const settings = useSettings();
  const connect = useConnectGithub();
  const disconnect = useDisconnectGithub();
  const push = usePushGithub();
  const startOAuth = useStartOAuthGithub();
  const awaitOAuth = useAwaitOAuthGithub();
  const cancelOAuth = useCancelOAuthGithub();

  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [showPatForm, setShowPatForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<string | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<OAuthStartResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setOwner("");
      setRepo("");
      setToken("");
      setShowPatForm(false);
      setError(null);
      setPushResult(null);
      setDeviceFlow(null);
      setCopied(false);
      connect.reset();
      disconnect.reset();
      push.reset();
      startOAuth.reset();
      awaitOAuth.reset();
      if (awaitOAuth.isPending || deviceFlow) {
        cancelOAuth.mutate(appSlug);
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const connected = status.data?.connected === true;
  const hasClientId = Boolean(settings.data?.githubOAuthClientId);
  const awaitingAuth = Boolean(deviceFlow) && !connected;

  async function handleOAuthConnect() {
    setError(null);
    setDeviceFlow(null);
    try {
      const flow = await startOAuth.mutateAsync(appSlug);
      setDeviceFlow(flow);
      try {
        await awaitOAuth.mutateAsync(appSlug);
        setDeviceFlow(null);
      } catch (err) {
        setDeviceFlow(null);
        throw err;
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleCancelOAuth() {
    cancelOAuth.mutate(appSlug);
    startOAuth.reset();
    awaitOAuth.reset();
    setDeviceFlow(null);
  }

  async function handleCopyCode() {
    if (!deviceFlow) return;
    try {
      await navigator.clipboard.writeText(deviceFlow.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable — ignore
    }
  }

  async function handleConnect() {
    setError(null);
    try {
      await connect.mutateAsync({ slug: appSlug, token, owner, repo });
      setToken("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      await disconnect.mutateAsync(appSlug);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handlePush() {
    setError(null);
    setPushResult(null);
    try {
      const r = await push.mutateAsync(appSlug);
      setPushResult(t("github.pushOk", { ref: r.ref }));
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
        className="w-[460px] max-w-[92vw] rounded-xl border border-border bg-popover p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Github className="h-5 w-5" />
          <h2 className="text-base font-semibold">{t("github.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("github.loading")}
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
              <CheckCircle2 className="h-4 w-4 flex-none text-emerald-500" />
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {status.data?.owner}/{status.data?.repo}
                </div>
                {status.data?.user ? (
                  <div className="truncate text-xs text-muted-foreground">
                    @{status.data.user}
                  </div>
                ) : null}
              </div>
              <a
                href={`https://github.com/${status.data?.owner}/${status.data?.repo}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
                title={t("github.openRepo")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}
            {pushResult ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
                {pushResult}
              </div>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePush}
                disabled={push.isPending}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {push.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {push.isPending ? t("github.pushing") : t("github.push")}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted disabled:opacity-60"
              >
                {t("github.disconnect")}
              </button>
            </div>
          </div>
        ) : hasClientId ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("github.oauthHelper")}</p>

            <button
              type="button"
              onClick={handleOAuthConnect}
              disabled={startOAuth.isPending || awaitingAuth}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {startOAuth.isPending || awaitingAuth ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Github className="h-4 w-4" />
              )}
              {t("github.connect")}
            </button>

            {awaitingAuth && deviceFlow ? (
              <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="text-sm font-medium">{t("github.deviceTitle")}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground">1.</span>
                    <span className="text-muted-foreground">{t("github.goTo")}</span>
                    <a
                      href={deviceFlow.verificationUri}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-primary hover:underline"
                    >
                      {deviceFlow.verificationUri}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">2.</span>
                    <span className="text-muted-foreground">{t("github.enterCode")}</span>
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                      {deviceFlow.userCode}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label={t("github.copy")}
                      title={copied ? t("github.copied") : t("github.copy")}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{t("github.waitingAuth")}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelOAuth}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"
                >
                  {t("github.cancel")}
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowPatForm((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showPatForm ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {t("github.advanced")}
            </button>
            {showPatForm ? (
              <PatForm
                owner={owner}
                setOwner={setOwner}
                repo={repo}
                setRepo={setRepo}
                token={token}
                setToken={setToken}
                isPending={connect.isPending}
                onConnect={handleConnect}
              />
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-3 text-sm">
              <p className="font-medium">{t("github.needClientId")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("github.needClientIdHint")}
              </p>
              <Link
                to="/settings"
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t("github.openSettings")} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setShowPatForm((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showPatForm ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {t("github.advanced")}
            </button>
            {showPatForm ? (
              <PatForm
                owner={owner}
                setOwner={setOwner}
                repo={repo}
                setRepo={setRepo}
                token={token}
                setToken={setToken}
                isPending={connect.isPending}
                onConnect={handleConnect}
              />
            ) : null}
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PatForm({
  owner,
  setOwner,
  repo,
  setRepo,
  token,
  setToken,
  isPending,
  onConnect,
}: {
  owner: string;
  setOwner: (v: string) => void;
  repo: string;
  setRepo: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  isPending: boolean;
  onConnect: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">
        {t("github.helper")}{" "}
        <a
          href="https://github.com/settings/tokens/new?scopes=repo&description=Metacore"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {t("github.createToken")} <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">{t("github.owner")}</span>
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="your-username"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">{t("github.repo")}</span>
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="my-project"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block text-muted-foreground">{t("github.token")}</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_…"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm outline-none focus:border-primary"
        />
      </label>
      <button
        type="button"
        onClick={onConnect}
        disabled={isPending || !owner || !repo || !token}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? t("github.connecting") : t("github.connectWithToken")}
      </button>
    </div>
  );
}
