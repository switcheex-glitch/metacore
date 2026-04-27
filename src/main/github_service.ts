import * as git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { safeStorage, shell } from "electron";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { apps } from "@/db/schema";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "Metacore/0.1";

export type GithubStatus = {
  connected: boolean;
  owner: string | null;
  repo: string | null;
  user: string | null;
};

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(token);
    return `enc:${buf.toString("base64")}`;
  }
  // Fallback: store prefixed so we know it's plaintext. Not ideal, but
  // safeStorage is unavailable on some Linux desktops without a keyring.
  return `raw:${Buffer.from(token, "utf8").toString("base64")}`;
}

function decryptToken(stored: string): string {
  if (stored.startsWith("enc:")) {
    const buf = Buffer.from(stored.slice(4), "base64");
    return safeStorage.decryptString(buf);
  }
  if (stored.startsWith("raw:")) {
    return Buffer.from(stored.slice(4), "base64").toString("utf8");
  }
  // Legacy raw value
  return stored;
}

async function gh(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return res;
}

async function fetchUser(token: string): Promise<string> {
  const res = await gh("/user", token);
  if (!res.ok) {
    throw new Error(`GitHub auth failed (${res.status}). Проверь токен и его права (нужен scope "repo").`);
  }
  const body = (await res.json()) as { login?: string };
  if (!body.login) throw new Error("GitHub вернул пустой login");
  return body.login;
}

async function ensureRepoExists(
  token: string,
  login: string,
  owner: string,
  repo: string,
): Promise<void> {
  const head = await gh(`/repos/${owner}/${repo}`, token);
  if (head.ok) return;
  if (head.status !== 404) {
    throw new Error(`Не удалось проверить репозиторий ${owner}/${repo}: HTTP ${head.status}`);
  }
  // Create — endpoint differs for user vs org.
  const endpoint = owner === login ? "/user/repos" : `/orgs/${owner}/repos`;
  const create = await gh(endpoint, token, {
    method: "POST",
    body: { name: repo, private: true, auto_init: false },
  });
  if (!create.ok) {
    const text = await create.text().catch(() => "");
    throw new Error(
      `Не удалось создать ${owner}/${repo}: HTTP ${create.status}. ${text.slice(0, 200)}`,
    );
  }
}

export async function getGithubStatus(slug: string): Promise<GithubStatus> {
  const db = getDb();
  const row = (await db.select().from(apps).where(eq(apps.slug, slug)))[0];
  if (!row) throw new Error(`App not found: ${slug}`);
  return {
    connected: Boolean(row.githubTokenEnc && row.githubOrg && row.githubRepo),
    owner: row.githubOrg ?? null,
    repo: row.githubRepo ?? null,
    user: row.githubUser ?? null,
  };
}

export async function connectGithub(input: {
  slug: string;
  token: string;
  owner: string;
  repo: string;
}): Promise<{ user: string }> {
  const token = input.token.trim();
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  if (!token || !owner || !repo) throw new Error("Нужны token, owner и repo");

  const login = await fetchUser(token);
  await ensureRepoExists(token, login, owner, repo);

  const db = getDb();
  const row = (await db.select().from(apps).where(eq(apps.slug, input.slug)))[0];
  if (!row) throw new Error(`App not found: ${input.slug}`);

  await db
    .update(apps)
    .set({
      githubOrg: owner,
      githubRepo: repo,
      githubUser: login,
      githubTokenEnc: encryptToken(token),
    })
    .where(eq(apps.id, row.id));

  return { user: login };
}

export async function disconnectGithub(slug: string): Promise<void> {
  const db = getDb();
  const row = (await db.select().from(apps).where(eq(apps.slug, slug)))[0];
  if (!row) throw new Error(`App not found: ${slug}`);
  await db
    .update(apps)
    .set({
      githubOrg: null,
      githubRepo: null,
      githubUser: null,
      githubTokenEnc: null,
    })
    .where(eq(apps.id, row.id));
}

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

type TokenOk = { access_token: string; token_type: string; scope: string };
type TokenErr = { error: string; error_description?: string };

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

type PendingFlow = {
  clientId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  intervalMs: number;
  expiresAt: number;
  controller: AbortController;
};

const activeFlows = new Map<string, PendingFlow>();

export async function cancelOAuthFlow(slug: string): Promise<void> {
  const flow = activeFlows.get(slug);
  if (flow) {
    flow.controller.abort();
    activeFlows.delete(slug);
  }
}

export type OAuthStartResult = {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
};

export async function startOAuthFlow(input: {
  slug: string;
  clientId: string;
}): Promise<OAuthStartResult> {
  const clientId = input.clientId.trim();
  if (!clientId) {
    throw new Error(
      "GitHub OAuth Client ID не задан. Открой Настройки → GitHub и вставь Client ID своего OAuth App.",
    );
  }

  await cancelOAuthFlow(input.slug);
  const controller = new AbortController();

  const deviceRes = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ client_id: clientId, scope: "repo" }),
    signal: controller.signal,
  });
  if (!deviceRes.ok) {
    const text = await deviceRes.text().catch(() => "");
    throw new Error(
      `GitHub device flow init failed: HTTP ${deviceRes.status}. ${text.slice(0, 200)}`,
    );
  }
  const device = (await deviceRes.json()) as DeviceCodeResponse;
  const verificationUriComplete =
    device.verification_uri_complete ?? device.verification_uri;

  activeFlows.set(input.slug, {
    clientId,
    deviceCode: device.device_code,
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    verificationUriComplete,
    intervalMs: device.interval * 1000,
    expiresAt: Date.now() + device.expires_in * 1000,
    controller,
  });

  // Convenience: open the verification page in the user's browser. The code
  // is also visible in the modal so users can authorize manually on a
  // different device or paste the code themselves.
  void shell.openExternal(verificationUriComplete).catch(() => {});

  return {
    userCode: device.user_code,
    verificationUri: device.verification_uri,
    verificationUriComplete,
    expiresIn: device.expires_in,
  };
}

export async function awaitOAuthAuthorization(
  slug: string,
): Promise<{ user: string; owner: string; repo: string }> {
  const flow = activeFlows.get(slug);
  if (!flow) {
    throw new Error("Нет активной авторизации. Нажми Connect ещё раз.");
  }

  try {
    const token = await pollForToken({
      clientId: flow.clientId,
      deviceCode: flow.deviceCode,
      intervalMs: flow.intervalMs,
      expiresAt: flow.expiresAt,
      signal: flow.controller.signal,
    });

    const login = await fetchUser(token);
    const row = (await getDb().select().from(apps).where(eq(apps.slug, slug)))[0];
    if (!row) throw new Error(`App not found: ${slug}`);

    const owner = login;
    const repo = normalizeRepoName(row.slug);
    await ensureRepoExists(token, login, owner, repo);

    await getDb()
      .update(apps)
      .set({
        githubOrg: owner,
        githubRepo: repo,
        githubUser: login,
        githubTokenEnc: encryptToken(token),
      })
      .where(eq(apps.id, row.id));

    return { user: login, owner, repo };
  } finally {
    activeFlows.delete(slug);
  }
}

function normalizeRepoName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "metacore-app";
}

async function pollForToken(opts: {
  clientId: string;
  deviceCode: string;
  intervalMs: number;
  expiresAt: number;
  signal: AbortSignal;
}): Promise<string> {
  let interval = opts.intervalMs;
  while (Date.now() < opts.expiresAt) {
    if (opts.signal.aborted) throw new Error("OAuth flow cancelled");
    await delay(interval, opts.signal);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: opts.clientId,
        device_code: opts.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal: opts.signal,
    });
    const body = (await res.json().catch(() => ({}))) as Partial<TokenOk & TokenErr>;

    if (body.access_token) return body.access_token;
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      interval += 5000;
      continue;
    }
    if (body.error === "expired_token") {
      throw new Error("Код авторизации истёк. Нажми Connect ещё раз.");
    }
    if (body.error === "access_denied") {
      throw new Error("Авторизация отклонена в GitHub.");
    }
    if (body.error) {
      throw new Error(`GitHub: ${body.error}${body.error_description ? ` — ${body.error_description}` : ""}`);
    }
  }
  throw new Error("Время ожидания авторизации истекло.");
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("OAuth flow cancelled"));
    });
  });
}

export async function pushToGithub(slug: string): Promise<{ pushed: true; ref: string }> {
  const db = getDb();
  const row = (await db.select().from(apps).where(eq(apps.slug, slug)))[0];
  if (!row) throw new Error(`App not found: ${slug}`);
  if (!row.githubTokenEnc || !row.githubOrg || !row.githubRepo) {
    throw new Error("GitHub не подключён для этого проекта");
  }
  const token = decryptToken(row.githubTokenEnc);
  const url = `https://github.com/${row.githubOrg}/${row.githubRepo}.git`;
  const ref =
    (await git.currentBranch({ fs, dir: row.path, fullname: false })) ?? "main";

  await git.push({
    fs,
    http,
    dir: row.path,
    url,
    ref,
    remoteRef: ref,
    force: false,
    onAuth: () => ({ username: "x-access-token", password: token }),
  });

  return { pushed: true, ref };
}
