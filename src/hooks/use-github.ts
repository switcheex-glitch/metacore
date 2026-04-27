import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/ipc/ipc_client";

export type GithubStatus = {
  connected: boolean;
  owner: string | null;
  repo: string | null;
  user: string | null;
};

export function useGithubStatus(slug: string | undefined) {
  return useQuery<GithubStatus>({
    queryKey: ["github-status", slug],
    queryFn: () => invoke<GithubStatus>("github:status", { slug }),
    enabled: Boolean(slug),
  });
}

export function useConnectGithub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { slug: string; token: string; owner: string; repo: string }) =>
      invoke<{ user: string }>("github:connect", input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["github-status", vars.slug] });
    },
  });
}

export function useDisconnectGithub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => invoke<{ ok: true }>("github:disconnect", { slug }),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["github-status", slug] });
    },
  });
}

export function usePushGithub() {
  return useMutation({
    mutationFn: (slug: string) =>
      invoke<{ pushed: true; ref: string }>("github:push", { slug }),
  });
}

export type OAuthStartResult = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
};

export function useStartOAuthGithub() {
  return useMutation({
    mutationFn: (slug: string) =>
      invoke<OAuthStartResult>("github:oauthStart", { slug }),
  });
}

export function useAwaitOAuthGithub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      invoke<{ user: string; owner: string; repo: string }>("github:oauthAwait", { slug }),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["github-status", slug] });
    },
  });
}

export function useCancelOAuthGithub() {
  return useMutation({
    mutationFn: (slug: string) => invoke<{ ok: true }>("github:oauthCancel", { slug }),
  });
}
