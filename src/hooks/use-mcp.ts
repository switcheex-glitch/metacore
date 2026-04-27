import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/ipc/ipc_client";
import type { McpServer } from "@/db/schema";

export type McpServerView = Omit<McpServer, "args" | "env"> & {
  args: string[];
  env: Record<string, string>;
};

export type McpUpsertPayload = {
  id?: string;
  name: string;
  transport: "stdio" | "http";
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
  enabled?: boolean;
};

export function useMcpServers() {
  return useQuery<McpServerView[]>({
    queryKey: ["mcp-servers"],
    queryFn: () => invoke<McpServerView[]>("mcp:list", {}),
  });
}

export function useUpsertMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: McpUpsertPayload) => invoke<McpServer>("mcp:upsert", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}

export function useRemoveMcpServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invoke<{ ok: true }>("mcp:remove", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-servers"] }),
  });
}
