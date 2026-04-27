import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  RefreshCw,
  Copy,
} from "lucide-react";
import type { FileNode } from "@/ipc/handlers/app_handlers";
import { invoke } from "@/ipc/ipc_client";
import { useT } from "@/hooks/use-t";

type ReadFileResult = {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
  size: number;
};

function useFileTree(appSlug: string) {
  return useQuery<FileNode>({
    queryKey: ["app-files", appSlug],
    queryFn: () => invoke<FileNode>("app:listFiles", { slug: appSlug }),
    refetchInterval: 5000,
  });
}

function useFileContent(appSlug: string, filePath: string | null) {
  return useQuery<ReadFileResult | null>({
    queryKey: ["app-file", appSlug, filePath],
    enabled: Boolean(filePath),
    queryFn: async () => {
      if (!filePath) return null;
      return invoke<ReadFileResult>("app:readFile", {
        slug: appSlug,
        path: filePath,
      });
    },
  });
}

function flattenDefaultOpen(root: FileNode | undefined): Set<string> {
  const open = new Set<string>();
  if (!root) return open;
  open.add(root.path);
  for (const c of root.children ?? []) {
    if (c.kind === "dir" && (c.name === "src" || c.name === "public")) {
      open.add(c.path);
    }
  }
  return open;
}

export function FilesPanel({ appSlug }: { appSlug: string }) {
  const t = useT();
  const tree = useFileTree(appSlug);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (tree.data) {
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        return flattenDefaultOpen(tree.data);
      });
    }
  }, [tree.data]);

  const file = useFileContent(appSlug, selected);

  function toggle(p: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  const totalFiles = useMemo(() => countFiles(tree.data), [tree.data]);

  return (
    <div className="flex h-full">
      <aside className="flex w-[280px] flex-none flex-col border-r border-border/60 bg-background/40">
        <header className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
          <span>{t("code.filesCount", { n: String(totalFiles) })}</span>
          <button
            type="button"
            onClick={() => tree.refetch()}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
            title={t("code.refresh")}
          >
            <RefreshCw className={`h-3 w-3 ${tree.isFetching ? "animate-spin" : ""}`} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto py-1 font-mono text-[12px]">
          {tree.isLoading ? (
            <div className="px-3 py-2 text-muted-foreground">{t("code.loading")}</div>
          ) : !tree.data ? (
            <div className="px-3 py-2 text-muted-foreground">{t("code.empty")}</div>
          ) : (
            <TreeNode
              node={tree.data}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              selected={selected}
              onSelect={setSelected}
              isRoot
            />
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-background/80">
        <header className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
          {selected ? (
            <>
              <FileIcon className="h-3 w-3" />
              <span className="truncate font-mono" title={selected}>
                {selected}
              </span>
              {file.data?.truncated ? (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                  {t("code.truncated")}
                </span>
              ) : null}
              {file.data?.binary ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  binary
                </span>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  if (!file.data?.content) return;
                  try {
                    await navigator.clipboard.writeText(file.data.content);
                  } catch {
                    // ignore
                  }
                }}
                className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
              >
                <Copy className="h-3 w-3" />
                {t("code.copy")}
              </button>
            </>
          ) : (
            <span>{t("code.selectFile")}</span>
          )}
        </header>
        <div className="flex-1 overflow-auto">
          {!selected ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t("code.selectFileHint")}
            </div>
          ) : file.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t("code.loading")}</div>
          ) : file.data?.binary ? (
            <div className="p-6 text-sm text-muted-foreground">{t("code.binaryNotice")}</div>
          ) : (
            <pre className="whitespace-pre p-3 font-mono text-[12px] leading-5 text-foreground">
              {file.data?.content ?? ""}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}

function countFiles(node: FileNode | undefined): number {
  if (!node) return 0;
  let total = 0;
  function walk(n: FileNode) {
    if (n.kind === "file") total += 1;
    for (const c of n.children ?? []) walk(c);
  }
  walk(node);
  return total;
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  selected,
  onSelect,
  isRoot = false,
}: {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  selected: string | null;
  onSelect: (path: string) => void;
  isRoot?: boolean;
}) {
  const open = expanded.has(node.path);

  if (node.kind === "file") {
    const active = selected === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-1.5 truncate px-2 py-0.5 text-left transition ${
          active ? "bg-primary/10 text-foreground" : "hover:bg-muted"
        }`}
        style={{ paddingLeft: depth * 12 + 24 }}
        title={node.path}
      >
        <FileIcon className="h-3 w-3 flex-none text-muted-foreground" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className={`flex w-full items-center gap-1 truncate px-2 py-0.5 text-left transition hover:bg-muted ${
          isRoot ? "font-medium text-foreground" : "text-foreground"
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 flex-none text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-none text-muted-foreground" />
        )}
        {open ? (
          <FolderOpen className="h-3 w-3 flex-none text-muted-foreground" />
        ) : (
          <Folder className="h-3 w-3 flex-none text-muted-foreground" />
        )}
        <span className="truncate">{isRoot && !node.name ? "/" : node.name}</span>
      </button>
      {open
        ? (node.children ?? []).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selected={selected}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}
