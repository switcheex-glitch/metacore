import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke, subscribe } from "@/ipc/ipc_client";
import type { App as DbApp } from "@/db/schema";
import type { AppStatus, AppLogEntry, AppRunnerEvent } from "@/ipc/ipc_types";

export function useApps() {
  return useQuery<DbApp[]>({
    queryKey: ["apps"],
    queryFn: () => invoke<DbApp[]>("app:list"),
  });
}

export function useCreateApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string }) => invoke<DbApp>("app:create", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });
}

export function useImportApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sourceDir: string; name?: string }) =>
      invoke<DbApp>("app:import", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });
}

export function pickAppFolder() {
  return invoke<{ canceled: true } | { canceled: false; path: string }>("app:pickFolder");
}

export function useRenameApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; name: string }) =>
      invoke<{ ok: true }>("app:rename", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });
}

export function useDeleteApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; removeFiles?: boolean }) =>
      invoke<{ ok: true }>("app:delete", {
        slug: input.slug,
        removeFiles: input.removeFiles ?? true,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });
}

export function useAppStatus(slug: string | undefined) {
  return useQuery<AppStatus>({
    queryKey: ["app-status", slug],
    queryFn: () => invoke<AppStatus>("app:status", { slug }),
    enabled: Boolean(slug),
    refetchInterval: 2000,
  });
}

export function useStartApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => invoke<{ port: number }>("app:start", { slug }),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["app-status", slug] });
    },
  });
}

export function useStopApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => invoke<{ ok: true }>("app:stop", { slug }),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["app-status", slug] });
    },
  });
}

export function useRestartApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => invoke<{ port: number }>("app:restart", { slug }),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["app-status", slug] });
    },
  });
}

export function useAppLogs(slug: string | undefined) {
  const [logs, setLogs] = useState<AppLogEntry[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLogs([]);
    setLastError(null);
    setReadyUrl(null);

    invoke<AppLogEntry[]>("app:logs", { slug, limit: 500 }).then((initial) => {
      setLogs(initial);
      for (const e of initial) {
        if (e.kind === "stderr" && /(error|failed|uncaught|unhandled|ENOENT|EADDR)/i.test(e.line)) {
          setLastError((cur) => cur ?? e.line);
        }
      }
    });

    const offLog = subscribe("app:log", (data) => {
      const entry = data as AppLogEntry;
      if (entry.appSlug !== slug) return;
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    });

    const offEvent = subscribe("app:event", (data) => {
      const evt = data as AppRunnerEvent;
      if (evt.appSlug !== slug) return;
      if (evt.type === "error-detected") setLastError(evt.message);
      if (evt.type === "ready") setReadyUrl(evt.url);
      if (evt.type === "exit") setReadyUrl(null);
    });

    return () => {
      offLog();
      offEvent();
    };
  }, [slug]);

  return { logs, lastError, readyUrl, clearError: () => setLastError(null) };
}
