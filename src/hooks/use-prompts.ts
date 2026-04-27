import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/ipc/ipc_client";
import type { Prompt } from "@/db/schema";

export function usePrompts() {
  return useQuery<Prompt[]>({
    queryKey: ["prompts"],
    queryFn: () => invoke<Prompt[]>("prompts:list"),
  });
}

export function useUpsertPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id?: number;
      title: string;
      body: string;
      tags?: string | null;
    }) => invoke<Prompt>("prompts:upsert", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });
}

export function useRemovePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      invoke<{ ok: true }>("prompts:remove", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });
}
