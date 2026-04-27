import { useState } from "react";
import { History, RotateCcw, Undo2, GitCommit, FilePlus, FilePen, FileX, ChevronDown, ChevronRight } from "lucide-react";
import {
  useVersions,
  useVersionDetail,
  useRevertVersion,
  useUndoLastTurn,
  type VersionEntry,
} from "@/hooks/use-versions";
import { useConfirm } from "@/components/confirm-dialog";

export function VersionsPanel({ appSlug }: { appSlug: string }) {
  const versions = useVersions(appSlug);
  const undo = useUndoLastTurn(appSlug);
  const revert = useRevertVersion(appSlug);
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = versions.data ?? [];
  const latest = rows[0] ?? null;
  const canUndo = rows.length >= 2;

  async function handleUndo() {
    if (!canUndo) return;
    const ok = await confirm({
      title: "Отменить последний ход",
      message: "Откатить проект на предыдущий коммит и удалить последнюю пару сообщений?",
      confirmLabel: "Отменить ход",
      destructive: true,
    });
    if (!ok) return;
    try {
      await undo.mutateAsync();
    } catch (err) {
      alert(`Undo failed: ${(err as Error).message}`);
    }
  }

  async function handleRevert(entry: VersionEntry) {
    if (entry.isCurrent) return;
    const ok = await confirm({
      title: "Откатиться к версии",
      message: `Откатить к ${entry.shortHash}? Коммиты после этой точки будут удалены.`,
      confirmLabel: "Откатить",
      destructive: true,
    });
    if (!ok) return;
    try {
      await revert.mutateAsync(entry.commitHash);
    } catch (err) {
      alert(`Revert failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-4 py-2 text-sm">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Versions</span>
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "commit" : "commits"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo || undo.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:opacity-40"
            title="Undo last turn"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo last
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {versions.isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading history…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No commits yet. Make a change in Build mode to create the first version.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((entry) => {
              const open = expanded === entry.commitHash;
              return (
                <li key={entry.commitHash} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : entry.commitHash)}
                      className="mt-0.5 rounded p-0.5 text-muted-foreground hover:bg-muted"
                      aria-label={open ? "Collapse" : "Expand"}
                    >
                      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <GitCommit className="mt-0.5 h-3.5 w-3.5 flex-none text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{entry.shortHash}</span>
                        {entry.isCurrent ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            current
                          </span>
                        ) : null}
                        {entry.isLatest && entry !== latest ? null : entry.isLatest ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            latest
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-sm" title={entry.message}>
                        {entry.summary ?? entry.message}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString()} · {entry.author}
                      </div>
                      {open ? <VersionDiffDetail appSlug={appSlug} commitHash={entry.commitHash} /> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevert(entry)}
                      disabled={entry.isCurrent || revert.isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-40"
                      title={entry.isCurrent ? "Current commit" : "Revert to this commit"}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Revert
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function VersionDiffDetail({ appSlug, commitHash }: { appSlug: string; commitHash: string }) {
  const detail = useVersionDetail(appSlug, commitHash);
  if (detail.isLoading) {
    return <div className="mt-2 text-xs text-muted-foreground">Loading changes…</div>;
  }
  const data = detail.data;
  if (!data) return null;
  const total = data.added.length + data.modified.length + data.deleted.length;
  if (total === 0) {
    return <div className="mt-2 text-xs text-muted-foreground">No file changes.</div>;
  }
  return (
    <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 font-mono text-[11px]">
      {data.added.map((p) => (
        <DiffLine key={`a-${p}`} icon={<FilePlus className="h-3 w-3" />} path={p} tone="text-emerald-500" />
      ))}
      {data.modified.map((p) => (
        <DiffLine key={`m-${p}`} icon={<FilePen className="h-3 w-3" />} path={p} tone="text-amber-500" />
      ))}
      {data.deleted.map((p) => (
        <DiffLine key={`d-${p}`} icon={<FileX className="h-3 w-3" />} path={p} tone="text-destructive" />
      ))}
    </div>
  );
}

function DiffLine({
  icon,
  path,
  tone,
}: {
  icon: React.ReactNode;
  path: string;
  tone: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${tone}`}>
      {icon}
      <span className="truncate text-foreground" title={path}>
        {path}
      </span>
    </div>
  );
}
