import { z } from "zod";
import { registerInvokeHandler } from "../ipc_host";
import {
  awaitOAuthAuthorization,
  cancelOAuthFlow,
  connectGithub,
  disconnectGithub,
  getGithubStatus,
  startOAuthFlow,
  pushToGithub,
  type GithubStatus,
  type OAuthStartResult,
} from "@/main/github_service";
import { getSettings } from "@/main/settings";

const slugSchema = z.object({ slug: z.string().min(1).max(128) }).strict();

const connectSchema = z
  .object({
    slug: z.string().min(1).max(128),
    token: z.string().trim().min(10).max(512),
    owner: z.string().trim().min(1).max(100),
    repo: z.string().trim().min(1).max(100),
  })
  .strict();

export function registerGithubHandlers() {
  registerInvokeHandler("github:status", async (_event, payload): Promise<GithubStatus> => {
    const { slug } = slugSchema.parse(payload);
    return getGithubStatus(slug);
  });

  registerInvokeHandler("github:connect", async (_event, payload): Promise<{ user: string }> => {
    const parsed = connectSchema.parse(payload);
    return connectGithub(parsed);
  });

  registerInvokeHandler("github:disconnect", async (_event, payload): Promise<{ ok: true }> => {
    const { slug } = slugSchema.parse(payload);
    await disconnectGithub(slug);
    return { ok: true };
  });

  registerInvokeHandler("github:push", async (_event, payload): Promise<{ pushed: true; ref: string }> => {
    const { slug } = slugSchema.parse(payload);
    return pushToGithub(slug);
  });

  registerInvokeHandler(
    "github:oauthStart",
    async (_event, payload): Promise<OAuthStartResult> => {
      const { slug } = slugSchema.parse(payload);
      const clientId = getSettings().githubOAuthClientId ?? "";
      return startOAuthFlow({ slug, clientId });
    },
  );

  registerInvokeHandler(
    "github:oauthAwait",
    async (_event, payload): Promise<{ user: string; owner: string; repo: string }> => {
      const { slug } = slugSchema.parse(payload);
      return awaitOAuthAuthorization(slug);
    },
  );

  registerInvokeHandler("github:oauthCancel", async (_event, payload): Promise<{ ok: true }> => {
    const { slug } = slugSchema.parse(payload);
    await cancelOAuthFlow(slug);
    return { ok: true };
  });
}
