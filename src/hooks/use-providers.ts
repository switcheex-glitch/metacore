import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/ipc/ipc_client";
import type { ProviderListItem } from "@/ipc/handlers/provider_handlers";
import type { LanguageModel } from "@/db/schema";
import type { PublicSettings } from "@/main/settings";

export function useProviders() {
  return useQuery<ProviderListItem[]>({
    queryKey: ["providers"],
    queryFn: () => invoke<ProviderListItem[]>("provider:list"),
  });
}

export function useModels(providerId?: string) {
  return useQuery<LanguageModel[]>({
    queryKey: ["models", providerId ?? "all"],
    queryFn: () => invoke<LanguageModel[]>("provider:models", providerId ? { providerId } : undefined),
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { providerId: string; apiKey: string }) =>
      invoke<{ ok: true; hasKey: boolean }>("provider:setApiKey", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useConnectClaude() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { apiKey: string }) =>
      invoke<{ ok: true; hasKey: boolean; modelCount: number }>(
        "provider:connectClaude",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

export function useSettings() {
  return useQuery<PublicSettings>({
    queryKey: ["settings"],
    queryFn: () => invoke<PublicSettings>("settings:get"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<PublicSettings>) =>
      invoke<PublicSettings>("settings:set", patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}
