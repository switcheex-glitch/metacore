import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/ipc/ipc_client";

export type VersionEntry = {
  commitHash: string;
  shortHash: string;
  message: string;
  summary: string | null;
  timestamp: number;
  author: string;
  changedPaths: { added: string[]; modified: string[]; deleted: string[] } | null;
  isCurrent: boolean;
  isLatest: boolean;
  dbVersionId: number | null;
};

export type VersionDetail = {
  added: string[];
  modified: string[];
  deleted: string[];
};

export type RevertResult = {
  commitHash: string | null;
  rewoundCount: number;
};

export function useVersions(slug: string | undefined) {
  return useQuery<VersionEntry[]>({
    queryKey: ["versions", slug],
    queryFn: () => invoke<VersionEntry[]>("version:list", { appSlug: slug, limit: 80 }),
    enabled: Boolean(slug),
  });
}

export function useVersionDetail(slug: string | undefined, commitHash: string | null) {
  return useQuery<VersionDetail>({
    queryKey: ["version-detail", slug, commitHash],
    queryFn: () =>
      invoke<VersionDetail>("version:detail", { appSlug: slug, commitHash: commitHash! }),
    enabled: Boolean(slug && commitHash),
  });
}

export function useRevertVersion(slug: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commitHash: string) =>
      invoke<RevertResult>("version:revert", { appSlug: slug, commitHash }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["versions", slug] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

export function useUndoLastTurn(slug: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<RevertResult>("version:undo", { appSlug: slug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["versions", slug] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}
