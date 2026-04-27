import { useEffect, useState } from "react";
import { Plus, Sparkles, Trash2, FolderOpen, Upload, AlertCircle, Youtube, Loader2 } from "lucide-react";
import { invoke } from "@/ipc/ipc_client";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useApps,
  useCreateApp,
  useDeleteApp,
  useImportApp,
  pickAppFolder,
} from "@/hooks/use-apps";
import { useT } from "@/hooks/use-t";
import { useConfirm } from "@/components/confirm-dialog";
import type { App as DbApp } from "@/db/schema";

export function AppsListPage() {
  const t = useT();
  const apps = useApps();
  const createApp = useCreateApp();
  const importApp = useImportApp();
  const deleteApp = useDeleteApp();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);

  async function handleFromVideo() {
    setVideoBusy(true);
    try {
      const res = await invoke<{ ok: boolean; text?: string; error?: string }>(
        "video:getTranscript",
        { url: videoUrl },
      );
      if (!res.ok || !res.text) {
        setToast(`Не удалось получить транскрипт: ${res.error ?? "пусто"}`);
        return;
      }
      const app = await createApp.mutateAsync({});
      try {
        localStorage.setItem(
          `pendingPromptForApp:${app.slug}`,
          `Построй полноценный проект по этому YouTube-туториалу. Транскрипт:\n\n${res.text.slice(0, 8000)}`,
        );
      } catch {
        // ignore storage errors
      }
      await navigate({ to: "/apps/$slug", params: { slug: app.slug } });
      setVideoOpen(false);
      setVideoUrl("");
    } catch (e) {
      setToast(`Ошибка: ${(e as Error).message}`);
    } finally {
      setVideoBusy(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function handleNewApp() {
    if (creating) return;
    setCreating(true);
    try {
      const app = await createApp.mutateAsync({});
      await navigate({ to: "/apps/$slug", params: { slug: app.slug } });
    } catch (err) {
      console.error("Create app failed:", err);
      alert(`${t("home.createFailed")}: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleImportApp() {
    if (importing) return;
    setImporting(true);
    try {
      const result = await pickAppFolder();
      if (result.canceled) return;
      const app = await importApp.mutateAsync({ sourceDir: result.path });
      await navigate({ to: "/apps/$slug", params: { slug: app.slug } });
    } catch (err) {
      console.error("Import app failed:", err);
      alert(`${t("home.importFailed")}: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(app: DbApp) {
    const ok = await confirm({
      title: "Удалить проект",
      message: t("home.deleteConfirm", { name: app.name }),
      confirmLabel: "Удалить",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteApp.mutateAsync({ slug: app.slug, removeFiles: true });
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const human = /EBUSY|locked|busy/i.test(msg)
        ? "Папка проекта занята другим процессом. Закройте редактор/проводник и попробуйте снова."
        : msg;
      setToast(`${t("home.deleteFailed")}: ${human}`);
    }
  }

  const rows = apps.data ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-xl backdrop-blur-xl">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none text-red-300" />
          <span className="max-w-md">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-red-200/70 hover:text-red-100"
          >
            ✕
          </button>
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-5xl px-10 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t("home.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              <Youtube className="h-4 w-4" />
              Из YouTube
            </button>
            <button
              type="button"
              onClick={handleImportApp}
              disabled={importing}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {importing ? t("home.importing") : t("home.importApp")}
            </button>
            <button
              type="button"
              onClick={handleNewApp}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? t("home.creating") : t("home.newApp")}
            </button>
          </div>
        </div>

        {apps.isLoading ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            {t("home.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-medium">{t("home.emptyTitle")}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("home.emptyBody")}</p>
          </div>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {rows.map((app) => (
              <li
                key={app.id}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40"
              >
                <Link
                  to="/apps/$slug"
                  params={{ slug: app.slug }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{app.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {app.slug}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate" title={app.path}>
                    {app.path}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(app)}
                    className="ml-2 rounded p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("home.deleteApp")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {videoOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-popover p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Из YouTube</h2>
              <button type="button" onClick={() => setVideoOpen(false)} className="text-muted-foreground">
                ✕
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Metacore возьмёт транскрипт видео и соберёт проект по нему (через AI в чате).
            </p>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm transition hover:bg-muted"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleFromVideo}
                disabled={videoBusy || !videoUrl.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
                Создать проект
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
