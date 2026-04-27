import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { settingsFilePath } from "@/paths/paths";
import type { ChatMode, ProviderId } from "@/ipc/ipc_types";

export type ReleaseChannel = "stable" | "beta";

export type UserSettings = {
  providerApiKeys: Record<ProviderId, string>;
  enableAutoUpdate: boolean;
  releaseChannel: ReleaseChannel;
  defaultChatMode: ChatMode;
  telemetryId: string | null;
  telemetryOptIn: boolean;
  hasRunBefore: boolean;
  autoApprovedMcpTools: Record<string, true>;
  githubOAuthClientId: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  metacoreKey: string | null;
  supabaseAccessToken: string | null;
  supabaseProjectRef: string | null;
  tokensUsed: number;
  tokensLimit: number;
  /**
   * Stored alongside encrypted values so we know whether a future session
   * should try to decrypt or treat the value as plaintext (tests / no keyring).
   */
  encryptionAvailable: boolean;
};

const DEFAULTS: UserSettings = {
  providerApiKeys: {},
  enableAutoUpdate: true,
  releaseChannel: "stable",
  defaultChatMode: "build",
  telemetryId: null,
  telemetryOptIn: false,
  hasRunBefore: false,
  autoApprovedMcpTools: {},
  githubOAuthClientId: null,
  supabaseUrl: null,
  supabaseAnonKey: null,
  metacoreKey: null,
  supabaseAccessToken: null,
  supabaseProjectRef: null,
  tokensUsed: 0,
  tokensLimit: 200,
  encryptionAvailable: false,
};

const ENCRYPTED_PREFIX = "enc:v1:";

export function encrypt(plain: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buf = safeStorage.encryptString(plain);
    return ENCRYPTED_PREFIX + buf.toString("base64");
  }
  // Fallback — flagged by prefix so decrypt knows it's plaintext.
  return "plain:" + Buffer.from(plain, "utf8").toString("base64");
}

export function decrypt(cipher: string): string {
  if (cipher.startsWith(ENCRYPTED_PREFIX)) {
    const buf = Buffer.from(cipher.slice(ENCRYPTED_PREFIX.length), "base64");
    return safeStorage.decryptString(buf);
  }
  if (cipher.startsWith("plain:")) {
    return Buffer.from(cipher.slice(6), "base64").toString("utf8");
  }
  // Legacy plaintext
  return cipher;
}

function readRaw(): Partial<UserSettings> {
  const file = settingsFilePath();
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    if (parsed.metacoreKey && typeof parsed.metacoreKey === "string") {
      const v = parsed.metacoreKey;
      if (v.startsWith(ENCRYPTED_PREFIX) || v.startsWith("plain:")) {
        try {
          parsed.metacoreKey = decrypt(v);
        } catch {
          parsed.metacoreKey = null;
        }
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeRaw(settings: UserSettings) {
  const file = settingsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const onDisk: UserSettings = {
    ...settings,
    metacoreKey: settings.metacoreKey ? encrypt(settings.metacoreKey) : null,
  };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(onDisk, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

let cache: UserSettings | null = null;

export function getSettings(): UserSettings {
  if (cache) return cache;
  const fromDisk = readRaw();
  cache = {
    ...DEFAULTS,
    ...fromDisk,
    providerApiKeys: { ...(fromDisk.providerApiKeys ?? {}) },
    autoApprovedMcpTools: { ...(fromDisk.autoApprovedMcpTools ?? {}) },
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  };
  return cache;
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const current = getSettings();
  const next: UserSettings = { ...current, ...patch };
  if ("metacoreKey" in patch && patch.metacoreKey && patch.metacoreKey !== current.metacoreKey) {
    next.tokensUsed = 0;
    next.tokensLimit = DEFAULTS.tokensLimit;
  }
  cache = next;
  writeRaw(cache);
  return cache;
}

// Built-in providers proxied through Metacore servers. Users can never see,
// change, or remove the underlying API key — every request is proxied via
// Supabase Edge Functions, and the user's Metacore license key is sent as the
// auth header so the proxy can validate + bill them. The IPC layer rejects
// any attempt to overwrite these providers.
export const BUILT_IN_PROVIDERS: ReadonlySet<ProviderId> = new Set(["openrouter"]);

export function isBuiltInProvider(providerId: ProviderId): boolean {
  return BUILT_IN_PROVIDERS.has(providerId);
}

export function getApiKey(providerId: ProviderId): string | null {
  // Proxied built-in providers authenticate as the user's Metacore license
  // key (validated by the proxy edge function).
  if (isBuiltInProvider(providerId)) {
    const s = getSettings();
    return s.metacoreKey ?? null;
  }
  const s = getSettings();
  const stored = s.providerApiKeys[providerId];
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

export function setApiKey(providerId: ProviderId, plaintextKey: string) {
  if (isBuiltInProvider(providerId)) {
    throw new Error(`provider ${providerId} is built-in and locked`);
  }
  const current = getSettings();
  const next: Record<ProviderId, string> = { ...current.providerApiKeys };
  if (plaintextKey.length === 0) {
    delete next[providerId];
  } else {
    next[providerId] = encrypt(plaintextKey);
  }
  updateSettings({ providerApiKeys: next });
}

export function hasApiKey(providerId: ProviderId): boolean {
  if (isBuiltInProvider(providerId)) {
    return Boolean(getSettings().metacoreKey);
  }
  const s = getSettings();
  return Boolean(s.providerApiKeys[providerId]);
}

export type PublicSettings = Omit<UserSettings, "providerApiKeys"> & {
  providers: Array<{ providerId: ProviderId; hasKey: boolean }>;
};

export function getPublicSettings(): PublicSettings {
  const s = getSettings();
  return {
    ...s,
    providers: Object.keys(s.providerApiKeys).map((id) => ({
      providerId: id,
      hasKey: true,
    })),
  };
}
