# Metacore — Security audit & hardening

Last pass: 2026-04-22

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| User's API keys (Anthropic, OpenRouter) | Theft from disk | `safeStorage.encryptString` (OS keyring) via `main/settings.ts` |
| `metacoreKey` (license) | Sharing, extraction | Server-side validation via Supabase RPC `validate_metacore_key`; revoke on abuse |
| Lava/Platega secrets | Client extraction | **Never in client** — live only in Supabase Edge Function env |
| Supabase `anon` key | Exposed in client by design | Public-safe: RLS + Edge Function auth check |
| Source code (business logic) | Reverse-engineering | ASAR integrity + Fuses; full protection impossible for Electron |
| Installer | Tampering | Code-signing required (see §Code signing) |

## What's wired up now

### Electron Fuses (`forge.config.ts`)
- `RunAsNode: false` — no `ELECTRON_RUN_AS_NODE`
- `EnableNodeCliInspectArguments: false` — `--inspect` ignored
- `EnableNodeOptionsEnvironmentVariable: false` — `NODE_OPTIONS` ignored
- `EnableEmbeddedAsarIntegrityValidation: true` — ASAR hash checked at boot
- `OnlyLoadAppFromAsar: true` — won't run from unpacked dir
- `EnableCookieEncryption: true` — cookies encrypted on disk
- `GrantFileProtocolExtraPrivileges: false` — `file://` cannot XHR local files
- `LoadBrowserProcessSpecificV8Snapshot: false` — no snapshot swapping

### BrowserWindow hardening (`main.ts`)
- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`
- `allowRunningInsecureContent: false`, `experimentalFeatures: false`
- `enableWebSQL: false`, `spellcheck: false`
- DevTools blocked in production (F12 and `Ctrl/Cmd+Shift+I` handlers + auto-close on open)
- `will-navigate` deny-list — external URLs forced through `shell.openExternal`
- `window.open` → `shell.openExternal` + deny window creation
- `will-attach-webview` — nested webviews forced to sandbox, no preload

### Content Security Policy (production only)
Set via session `onHeadersReceived`:
```
default-src 'self'
script-src 'self'
style-src 'self' 'unsafe-inline'
connect-src 'self' https://*.supabase.co https://app.platega.io https://api.anthropic.com https://openrouter.ai https://api.github.com
object-src 'none'
frame-ancestors 'none'
```

### IPC surface (`preload.ts`)
- Channels are allowlisted (`ALLOWED_CHANNELS` set)
- Every handler uses Zod schemas to validate payloads
- No dynamic channel names from renderer

### Secret storage
- Provider API keys: `safeStorage` (Windows DPAPI / macOS Keychain / libsecret on Linux)
- Lava/Platega credentials: **server-side only** (Supabase function secrets)
- `metacoreKey`: stored in plaintext settings but validated server-side each session

## Hardening round 2 (post-review)

- **`sandbox: true`** now enforced on main window (preload uses only `contextBridge` + `ipcRenderer.invoke`, which are sandbox-compatible).
- **`webviewTag: false`** — `<webview>` fully disabled; no code in repo uses it.
- **Permission handlers** (`setPermissionRequestHandler` / `setPermissionCheckHandler`) deny camera, mic, geolocation, notifications, midi, usb, serial, hid, etc. — only clipboard read / sanitized-write allowed.
- **`shell.openExternal` wrapped** in `safeOpenExternal()` — allows only `https:`, `http:`, `mailto:`. Blocks `file:`, `javascript:`, custom URI handlers.
- **CSP narrowed** — `img-src` no longer blanket `https:`; now limited to `*.supabase.co` and GitHub user-content/avatars. Added `form-action 'none'`.
- **Deep link hardening** — `metacore://` host must match allowlist (`oauth-return`, `payment-success`), parameter keys/values filtered by regex, URL length capped at 2048 chars.
- **`metacoreKey` encrypted at rest** — now goes through `safeStorage.encryptString` on write, decrypted transparently on read. Same scheme as provider API keys.
- **IPC violation telemetry** — renderer attempts to call non-allowlisted channel now emit `security:ipcViolation` event, logged in main process.
- **Supabase RLS explicit deny policies** for `anon`/`authenticated` on `metacore_keys` and `payments` (defence in depth on top of default-deny).
- **Rate limit on `validate_metacore_key`** — max 30 calls/min per key. Burst above that returns `revoked=true` to burn brute-forcers.
- **Input validation in RPC** — key length bounds (8–128 chars) enforced server-side.

## What's NOT done (manual steps)

### 🔴 Code signing (critical for distribution)
Without a cert, Windows Defender / SmartScreen will flag the installer.

**Windows** (get EV or OV cert from SSL.com / Sectigo, ~$200–500/yr):
```ts
// forge.config.ts → packagerConfig
osxSign: { identity: "..." },        // macOS
win32metadata: { CompanyName: "..." },

// MakerSquirrel:
certificateFile: "./cert.pfx",
certificatePassword: process.env.WIN_CERT_PASSWORD,
```

**macOS** — notarization via `@electron/notarize`:
```ts
packagerConfig: {
  osxNotarize: {
    tool: "notarytool",
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  }
}
```

### 🟡 Code obfuscation (optional)
Adds hurdle but not real protection. If wanted:
```
npm i -D javascript-obfuscator vite-plugin-javascript-obfuscator
```
Apply to `vite.main.config.mts` + `vite.renderer.config.mts`. **Warning:** breaks stack traces, will hurt debugging.

### 🟡 Auto-update signing (Squirrel)
Squirrel on Windows uses code-signing cert from installer — no extra setup once signing is on.

### 🟡 Runtime anti-tamper (optional)
Can add `asar hash` check at runtime comparing to known-good hash. Electron Fuses already cover this at boot, so marginal value.

## Residual risks (cannot fix)

1. **ASAR is extractable**: anyone can run `npx asar extract app.asar out/` and read all JS. Assume all client code is public. Obfuscation only slows this down.
2. **Renderer DOM is inspectable**: attacker with process access can inject JS via Electron's remote debugging port — mitigated by disabling `--inspect` fuses, but local attacker with full machine access wins.
3. **User's machine compromised → user's keys compromised**: safeStorage protects only against casual filesystem dumps, not malware with keychain access.

## Testing checklist after build

- [ ] `npx @electron/fuses read out/Metacore-*/Metacore.exe` — all fuses show expected values
- [ ] Try to run with `ELECTRON_RUN_AS_NODE=1 Metacore.exe --version` — should fail
- [ ] Try `Metacore.exe --inspect` — port should not open
- [ ] Open DevTools via F12 in prod build — should immediately close
- [ ] Curl installer, verify `sigcheck` / signtool shows valid signature (once signed)
- [ ] Renderer console: try `window.require` — should be undefined
- [ ] Try loading external URL via injected `<iframe src>` — CSP denies

## References
- https://www.electronjs.org/docs/latest/tutorial/security
- https://github.com/doyensec/electronegativity (run this against packaged app)
