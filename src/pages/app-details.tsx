import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Play,
  RefreshCw,
  Square,
  Terminal,
  Monitor,
  Wrench,
  Copy,
  ExternalLink,
  History,
  FolderTree,
  Github,
  Pencil,
  Download,
  Smartphone,
  Tablet,
  Laptop,
  Share2,
} from "lucide-react";
import { invoke } from "@/ipc/ipc_client";
import {
  useAppLogs,
  useAppStatus,
  useApps,
  useRestartApp,
  useStartApp,
  useStopApp,
} from "@/hooks/use-apps";
import { useUndoLastTurn } from "@/hooks/use-versions";
import { LiveShareButton } from "@/components/live-share";
import { PublishModal } from "@/components/publish-modal";
import { useT } from "@/hooks/use-t";
import { ChatPanel } from "@/components/chat-panel";
import { VersionsPanel } from "@/components/versions-panel";
import { FilesPanel } from "@/components/files-panel";
import { GithubConnectModal } from "@/components/github-connect-modal";
import { useGithubStatus } from "@/hooks/use-github";

type PreviewTab = "preview" | "code" | "console" | "versions";

export type PencilPick = {
  selector: string;
  tag: string;
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  html: string;
};

export function AppDetailsPage() {
  const t = useT();
  const { slug } = useParams({ from: "/apps/$slug" });
  const appsQuery = useApps();
  const app = useMemo(
    () => appsQuery.data?.find((a) => a.slug === slug),
    [appsQuery.data, slug],
  );

  const status = useAppStatus(slug);
  const startApp = useStartApp();
  const stopApp = useStopApp();
  const restartApp = useRestartApp();
  const { logs, lastError, readyUrl, clearError } = useAppLogs(slug);

  const [tab, setTab] = useState<PreviewTab>("preview");
  const [iframeKey, setIframeKey] = useState(0);
  const [pencilOn, setPencilOn] = useState(false);
  const [pick, setPick] = useState<PencilPick | null>(null);
  const [responsive, setResponsive] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __metacore?: boolean; type?: string } & Partial<PencilPick>;
      if (!d || !d.__metacore || d.type !== "pencil-pick") return;
      if (!d.selector || !d.tag || !d.rect) return;
      setPick({
        selector: d.selector,
        tag: d.tag,
        text: d.text ?? "",
        rect: d.rect,
        html: d.html ?? "",
      });
      setPencilOn(false);
      void invoke("preview:pencilToggle", { enabled: false });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  async function togglePencil() {
    const next = !pencilOn;
    setPencilOn(next);
    if (!next) setPick(null);
    await invoke("preview:pencilToggle", { enabled: next, tool: "pencil" });
    if (next) setTab("preview");
  }

  const undoLastTurn = useUndoLastTurn(slug);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (!undoLastTurn.isPending) undoLastTurn.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoLastTurn]);
  const [pendingErrorPrompt, setPendingErrorPrompt] = useState<string | null>(null);
  const [githubOpen, setGithubOpen] = useState(false);
  const githubStatus = useGithubStatus(slug);
  const qc = useQueryClient();

  const url = status.data?.url ?? readyUrl ?? null;
  const running = status.data?.running ?? false;
  const port = status.data?.port ?? null;

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["messages"] });
  }, [readyUrl, qc]);

  useEffect(() => {
    if (readyUrl) setIframeKey((k) => k + 1);
  }, [readyUrl]);

  function handleFixWithAI() {
    if (!lastError) return;
    setPendingErrorPrompt(
      `The preview is showing this error. Please diagnose the cause and fix it.\n\nError:\n${lastError}`,
    );
    clearError();
  }

  const consoleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab === "console" && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [tab, logs.length]);

  async function handleStart() {
    try {
      await startApp.mutateAsync(slug);
    } catch (err) {
      alert(`${t("preview.startFailed")}: ${(err as Error).message}`);
    }
  }

  async function handleStop() {
    await stopApp.mutateAsync(slug);
  }

  async function handleRestart() {
    try {
      await restartApp.mutateAsync(slug);
      setIframeKey((k) => k + 1);
    } catch (err) {
      alert(`${t("preview.restartFailed")}: ${(err as Error).message}`);
    }
  }

  return (
    <div className="grid h-full grid-cols-[minmax(560px,640px)_1fr] divide-x divide-border">
      <ChatPanel
        appSlug={slug}
        pendingErrorPrompt={pendingErrorPrompt}
        clearPendingErrorPrompt={() => setPendingErrorPrompt(null)}
        pencilPick={pick}
        clearPencilPick={() => setPick(null)}
      />

      <section className="flex flex-col overflow-hidden bg-black">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-sm">
          <TabButton
            active={pencilOn}
            onClick={togglePencil}
            icon={<Pencil className="h-3.5 w-3.5" />}
          >
            Карандаш
          </TabButton>
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")} icon={<Monitor className="h-3.5 w-3.5" />}>
            {t("preview.tab")}
          </TabButton>
          <TabButton active={tab === "code"} onClick={() => setTab("code")} icon={<FolderTree className="h-3.5 w-3.5" />}>
            {t("code.tab")}
          </TabButton>
          <TabButton active={tab === "console"} onClick={() => setTab("console")} icon={<Terminal className="h-3.5 w-3.5" />}>
            {t("console.tab")}
            {logs.length > 0 ? (
              <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                {logs.length}
              </span>
            ) : null}
          </TabButton>
          <TabButton active={tab === "versions"} onClick={() => setTab("versions")} icon={<History className="h-3.5 w-3.5" />}>
            {t("versions.tab")}
          </TabButton>
          <div className="ml-auto flex items-center gap-1">
            <IconButton
              title={
                githubStatus.data?.connected
                  ? `${t("github.connected")} · ${githubStatus.data.owner}/${githubStatus.data.repo}`
                  : t("github.connect")
              }
              onClick={() => setGithubOpen(true)}
            >
              <Github
                className={`h-3.5 w-3.5 ${
                  githubStatus.data?.connected ? "text-emerald-400" : ""
                }`}
              />
            </IconButton>
            <IconButton
              title={responsive ? "Обычный превью" : "Мобильный/планшет/десктоп"}
              onClick={() => setResponsive((v) => !v)}
            >
              <Smartphone className={`h-3.5 w-3.5 ${responsive ? "text-primary" : ""}`} />
            </IconButton>
            <LiveShareButton appSlug={slug} />
            <IconButton title="Опубликовать в галерее" onClick={() => setPublishOpen(true)}>
              <Share2 className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title="Скачать проект zip"
              onClick={async () => {
                try {
                  const res = await invoke<{ name: string; dataBase64: string }>(
                    "app:exportZip",
                    { appSlug: slug },
                  );
                  const blob = new Blob([Uint8Array.from(atob(res.dataBase64), (c) => c.charCodeAt(0))], {
                    type: "application/zip",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = res.name;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                } catch (e) {
                  alert("Не удалось экспортировать: " + (e as Error).message);
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
            </IconButton>
            {running ? (
              <>
                <IconButton title={t("preview.restart")} onClick={handleRestart} disabled={restartApp.isPending}>
                  <RefreshCw className={`h-3.5 w-3.5 ${restartApp.isPending ? "animate-spin" : ""}`} />
                </IconButton>
                <IconButton title={t("preview.stop")} onClick={handleStop}>
                  <Square className="h-3.5 w-3.5" />
                </IconButton>
                {url ? (
                  <IconButton title={t("preview.openInBrowser")} onClick={() => window.open(url, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </IconButton>
                ) : null}
              </>
            ) : (
              <IconButton title={t("preview.start")} onClick={handleStart} disabled={startApp.isPending}>
                <Play className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        </header>

        {lastError ? (
          <div className="flex items-start gap-3 border-b border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-destructive">{t("preview.runtimeError")}</div>
              <div className="mt-0.5 truncate font-mono text-xs text-destructive/80" title={lastError}>
                {lastError}
              </div>
            </div>
            <button
              type="button"
              onClick={handleFixWithAI}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1.5 text-xs font-medium text-destructive-foreground transition hover:opacity-90"
            >
              <Wrench className="h-3 w-3" />
              {t("preview.fixWithAi")}
            </button>
            <button
              type="button"
              onClick={clearError}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {t("preview.dismiss")}
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-hidden">
          {tab === "preview" ? (
            url ? (
              responsive ? (
                <div className="flex h-full gap-3 overflow-auto bg-[#0b0b0f] p-4">
                  {[
                    { label: "Mobile", w: 375, icon: Smartphone },
                    { label: "Tablet", w: 768, icon: Tablet },
                    { label: "Desktop", w: 1280, icon: Laptop },
                  ].map((v) => {
                    const Ic = v.icon;
                    return (
                      <div key={v.label} className="flex flex-col rounded-lg border border-border bg-black">
                        <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                          <Ic className="h-3 w-3" />
                          {v.label} · {v.w}px
                        </div>
                        <iframe
                          key={`${url}-${iframeKey}-${v.label}`}
                          src={url}
                          title={v.label}
                          className="border-0 bg-white"
                          style={{ width: v.w, height: "100%" }}
                          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <iframe
                  key={`${url}-${iframeKey}`}
                  src={url}
                  title="App preview"
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Monitor className="h-6 w-6" />
                {running ? (
                  <span>{t("preview.waiting")}</span>
                ) : (
                  <>
                    <span>{t("preview.notRunning")}</span>
                    <button
                      type="button"
                      onClick={handleStart}
                      disabled={startApp.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
                    >
                      <Play className="h-4 w-4" />
                      {startApp.isPending ? t("preview.starting") : t("preview.startServer")}
                    </button>
                  </>
                )}
              </div>
            )
          ) : tab === "code" ? (
            <FilesPanel appSlug={slug} />
          ) : tab === "console" ? (
            <ConsoleView logs={logs} scrollRef={consoleRef} />
          ) : (
            <VersionsPanel appSlug={slug} />
          )}
        </div>

        {!app ? (
          <div className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            {t("preview.appNotFound")} <Link to="/" className="underline">{t("preview.backToApps")}</Link>
          </div>
        ) : null}
      </section>

      <GithubConnectModal
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        appSlug={slug}
      />
      {publishOpen ? (
        <PublishModal
          appSlug={slug}
          defaultName={app?.name ?? ""}
          onClose={() => setPublishOpen(false)}
          onDone={(res) => {
            setPublishOpen(false);
            setToast({
              kind: "ok",
              text: `Опубликовано в галерее · ${res.filesCount} файлов`,
            });
          }}
        />
      ) : null}
      {toast ? (
        <div
          className={`fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl ${
            toast.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
              : "border-red-500/40 bg-red-500/15 text-red-100"
          }`}
        >
          <span>{toast.kind === "ok" ? "✅" : "⚠️"}</span>
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
        active ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ConsoleView({
  logs,
  scrollRef,
}: {
  logs: import("@/ipc/ipc_types").AppLogEntry[];
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const t = useT();
  async function copyAll() {
    const text = logs.map((e) => e.line).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span>{t("console.lines", { n: String(logs.length) })}</span>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
        >
          <Copy className="h-3 w-3" /> {t("console.copy")}
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-background/80 px-3 py-2 font-mono text-[11px] leading-5"
      >
        {logs.length === 0 ? (
          <div className="text-muted-foreground">{t("console.empty")}</div>
        ) : (
          logs.map((e, i) => (
            <div
              key={`${e.ts}-${i}`}
              className={
                e.kind === "stderr"
                  ? "text-destructive"
                  : e.kind === "system"
                    ? "text-primary"
                    : "text-foreground"
              }
            >
              {e.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
