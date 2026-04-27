import { app, BrowserWindow, shell, ipcMain, autoUpdater } from "electron";

function safeOpenExternal(rawUrl: string): void {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:" && u.protocol !== "mailto:") {
      console.warn(`[security] blocked shell.openExternal for scheme ${u.protocol}: ${rawUrl}`);
      return;
    }
    void shell.openExternal(u.toString());
  } catch {
    console.warn(`[security] blocked malformed URL for shell.openExternal: ${rawUrl}`);
  }
}
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { registerAllHandlers, registerInvokeHandler } from "@/ipc/ipc_host";
import { initDatabase } from "@/db";
import { subscribeRunner, stopAllApps } from "@/main/app_runner";

const requireCjs = createRequire(import.meta.url);

if (process.platform === "win32") {
  try {
    if (requireCjs("electron-squirrel-startup")) {
      app.quit();
    }
  } catch {
    // optional dep, ignore
  }
}

const DEEP_LINK_PROTOCOL = "metacore";

// Injected into preview iframes when the user enables the "pencil" mode.
// Cross-origin safe: runs inside the iframe's origin via Electron's frame API.
const PENCIL_INJECT = `(() => {
  if (window.__mcPencilOff) window.__mcPencilOff();
  const style = document.createElement('style');
  style.id = '__metacore-pencil-style';
  style.textContent = '.__mc-hover { outline: 2px dashed #a855f7 !important; outline-offset: 2px !important; } body.__mc-pencil, body.__mc-pencil * { cursor: crosshair !important; }';
  document.head.appendChild(style);
  document.body.classList.add('__mc-pencil');
  let last = null;
  const describe = (el) => {
    const parts = [];
    let node = el;
    for (let i = 0; i < 4 && node && node !== document.body; i++) {
      const tag = node.tagName.toLowerCase();
      const id = node.id ? '#' + node.id : '';
      const cls = (node.className || '').toString().split(/\\s+/).filter(Boolean).filter(c => !c.startsWith('__mc-')).slice(0, 2).map(c => '.' + c).join('');
      parts.unshift(tag + id + cls);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const onMove = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (last && last !== el) last.classList.remove('__mc-hover');
    last = el;
    el.classList.add('__mc-hover');
  };
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || '').trim().slice(0, 200);
    window.parent.postMessage({
      __metacore: true,
      type: 'pencil-pick',
      selector: describe(el),
      tag: el.tagName.toLowerCase(),
      text,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      html: el.outerHTML.slice(0, 600),
    }, '*');
  };
  window.__mcPencilOff = () => {
    document.removeEventListener('mouseover', onMove, true);
    document.removeEventListener('click', onClick, true);
    if (last) last.classList.remove('__mc-hover');
    document.body.classList.remove('__mc-pencil');
    const s = document.getElementById('__metacore-pencil-style');
    if (s) s.remove();
    window.__metacorePencilOn = false;
  };
  document.addEventListener('mouseover', onMove, true);
  document.addEventListener('click', onClick, true);
  window.__metacorePencilOn = true;
})();`;

const PENCIL_CLEANUP = `(() => { if (window.__mcPencilOff) window.__mcPencilOff(); })();`;

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const __filenameESM = fileURLToPath(import.meta.url);
const __dirnameESM = path.dirname(__filenameESM);

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    backgroundColor: "#0b0b0f",
    icon: path.join(app.getAppPath(), "assets/icon.png"),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirnameESM, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: true,
      enableWebSQL: false,
    },
  });

  // Deny all sensitive browser permissions unless explicitly needed.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    const allowed = new Set<string>(["clipboard-read", "clipboard-sanitized-write"]);
    cb(allowed.has(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === "clipboard-read" || permission === "clipboard-sanitized-write";
  });

  const isDev = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);

  if (isDev) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL!);
  } else {
    win.loadFile(path.join(__dirnameESM, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    // Block DevTools in production.
    win.webContents.on("before-input-event", (event, input) => {
      const isDevToolsShortcut =
        (input.key === "I" && (input.control || input.meta) && input.shift) ||
        input.key === "F12";
      if (isDevToolsShortcut) event.preventDefault();
    });
    win.webContents.on("devtools-opened", () => win.webContents.closeDevTools());
  }

  // Lock down navigation — renderer may only stay on its own origin.
  const allowedOrigins = new Set<string>([
    ...(isDev ? [new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL!).origin] : []),
    "file://",
  ]);
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const u = new URL(url);
      const origin = u.protocol === "file:" ? "file://" : u.origin;
      if (!allowedOrigins.has(origin)) {
        event.preventDefault();
        safeOpenExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  win.webContents.on("will-attach-webview", (_e, webPreferences, _params) => {
    // Force safe defaults on any <webview> the renderer tries to attach.
    delete (webPreferences as { preload?: string }).preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
  });

  // Inject strict CSP on every response from the renderer origin.
  win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
    // Apply the app's strict CSP only to responses loaded by the main
    // Metacore window. User-project preview webviews run against localhost
    // dev-servers and must not inherit our CSP or they'd break on
    // frame-ancestors / script-src.
    const forMainWindow =
      details.webContentsId === win.webContents.id &&
      (details.url.startsWith("file:") ||
        (isDev && !!MAIN_WINDOW_VITE_DEV_SERVER_URL && details.url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)));
    if (!forMainWindow) {
      cb({ responseHeaders: details.responseHeaders });
      return;
    }
    const csp =
      isDev
        ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: " +
          `${MAIN_WINDOW_VITE_DEV_SERVER_URL} ws: http://localhost:* https://*.supabase.co https://app.platega.io; ` +
          "img-src 'self' data: blob: https:; font-src 'self' data:;"
        : "default-src 'self'; " +
          "script-src 'self'; " +
          // Tailwind emits inline styles at runtime — keeping unsafe-inline for
          // styles only (not scripts). Consider migrating to nonce-based CSP
          // when the toolchain allows.
          "style-src 'self' 'unsafe-inline'; " +
          // Narrow img-src: allow Supabase storage, GitHub avatars/CDN, Anthropic console asset, data:/blob: for attachments.
          "img-src 'self' data: blob: https://*.supabase.co https://avatars.githubusercontent.com https://*.githubusercontent.com; " +
          "font-src 'self' data:; " +
          "connect-src 'self' https://*.supabase.co https://app.platega.io https://api.anthropic.com https://openrouter.ai https://api.github.com; " +
          // User-project preview runs on http://localhost:<port>; allow embedding.
          "frame-src 'self' http://localhost:* http://127.0.0.1:*; " +
          "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none';";
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
        "X-Content-Type-Options": ["nosniff"],
        "Referrer-Policy": ["strict-origin-when-cross-origin"],
      },
    });
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelName = ["VERBOSE", "INFO", "WARN", "ERROR"][level] ?? String(level);
    if (levelName === "ERROR" || levelName === "WARN") {
      console.log(`[renderer:${levelName}] ${sourceId}:${line} ${message}`);
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer crashed] reason=${details.reason}, exitCode=${details.exitCode}`);
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer failed to load] ${errorCode} ${errorDescription} — ${validatedURL}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

// Actions we accept from metacore:// deep links. Anything else is dropped.
const DEEP_LINK_HOST_ALLOWLIST = new Set<string>(["oauth-return", "payment-success"]);
const SAFE_PARAM_RE = /^[A-Za-z0-9_.\-+=/:@% ]{1,512}$/;

function handleDeepLink(url: string) {
  if (typeof url !== "string" || url.length > 2048) return;
  if (!url.startsWith(`${DEEP_LINK_PROTOCOL}://`)) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== `${DEEP_LINK_PROTOCOL}:`) return;
  const host = parsed.host.toLowerCase();
  if (!DEEP_LINK_HOST_ALLOWLIST.has(host)) {
    console.warn(`[security] deep-link host not allowed: ${host}`);
    return;
  }
  const params: Record<string, string> = {};
  for (const [k, v] of parsed.searchParams) {
    if (!/^[a-z0-9_.\-]{1,64}$/i.test(k)) continue;
    if (!SAFE_PARAM_RE.test(v)) continue;
    params[k] = v;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("deeplink:oauth-return", { host, params });
  }
}

function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLink = argv.find((a) => a.startsWith(`${DEEP_LINK_PROTOCOL}://`));
    if (deepLink) handleDeepLink(deepLink);
  });

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1] ?? ""),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
  }

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.whenReady().then(async () => {
    try {
      await initDatabase();
    } catch (err) {
      console.error("Database init failed:", err);
    }
    await registerAllHandlers();
    ipcMain.on("security:ipcViolation", (_event, payload: unknown) => {
      const ch = (payload as { channel?: unknown })?.channel;
      console.warn(`[security] renderer tried disallowed IPC channel: ${String(ch)}`);
    });
    registerInvokeHandler("window:minimize", async (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize();
      return null;
    });
    registerInvokeHandler("window:maximize", async (event) => {
      const w = BrowserWindow.fromWebContents(event.sender);
      if (!w) return null;
      if (w.isMaximized()) w.unmaximize();
      else w.maximize();
      return null;
    });
    registerInvokeHandler("window:close", async (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close();
      return null;
    });
    registerInvokeHandler("update:check", async () => {
      if (!app.isPackaged) {
        return { ok: false, reason: "dev_mode" };
      }
      try {
        autoUpdater.checkForUpdates();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: (e as Error).message };
      }
    });

    registerInvokeHandler("update:install", async () => {
      if (!app.isPackaged) {
        return { ok: false, reason: "dev_mode" };
      }
      try {
        autoUpdater.quitAndInstall();
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: (e as Error).message };
      }
    });

    registerInvokeHandler("update:status", async () => updateState);

    registerInvokeHandler("preview:pencilToggle", async (_event, payload) => {
      const enabled = Boolean((payload as { enabled?: boolean } | null)?.enabled);
      if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
      const frames = mainWindow.webContents.mainFrame.framesInSubtree;
      const script = enabled ? PENCIL_INJECT : PENCIL_CLEANUP;
      for (const f of frames) {
        if (f === mainWindow.webContents.mainFrame) continue;
        try {
          await f.executeJavaScript(script);
        } catch {
          // cross-origin or frame gone — ignore
        }
      }
      return { ok: true };
    });
    mainWindow = createWindow();
    subscribeRunner(mainWindow.webContents);
    setupAutoUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        subscribeRunner(mainWindow.webContents);
      }
    });
  });

  app.on("before-quit", () => {
    stopAllApps();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

type UpdateState =
  | { phase: "idle"; version: string }
  | { phase: "checking"; version: string }
  | { phase: "available"; version: string }
  | { phase: "downloading"; version: string; nextVersion: string | null }
  | { phase: "ready"; version: string; nextVersion: string | null }
  | { phase: "error"; version: string; reason: string };

let updateState: UpdateState = { phase: "idle", version: app.getVersion() };

function setUpdateState(next: UpdateState) {
  updateState = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:state", updateState);
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }
  let updateElectronApp: typeof import("update-electron-app").updateElectronApp;
  let UpdateSourceType: typeof import("update-electron-app").UpdateSourceType;
  try {
    const mod = requireCjs("update-electron-app") as typeof import("update-electron-app");
    updateElectronApp = mod.updateElectronApp;
    UpdateSourceType = mod.UpdateSourceType;
  } catch (e) {
    console.warn("[updater] update-electron-app not available:", (e as Error).message);
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ phase: "checking", version: app.getVersion() });
  });
  autoUpdater.on("update-available", () => {
    setUpdateState({ phase: "downloading", version: app.getVersion(), nextVersion: null });
  });
  autoUpdater.on("update-not-available", () => {
    setUpdateState({ phase: "idle", version: app.getVersion() });
  });
  autoUpdater.on("update-downloaded", (_event, _notes, releaseName) => {
    setUpdateState({
      phase: "ready",
      version: app.getVersion(),
      nextVersion: releaseName ?? null,
    });
  });
  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err);
    setUpdateState({
      phase: "error",
      version: app.getVersion(),
      reason: err?.message ?? "unknown",
    });
  });

  try {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: "switcheex-glitch/metacore",
      },
      // 5 minutes — minimum allowed by update-electron-app. Initial check runs
      // automatically at startup; this controls re-check cadence.
      updateInterval: "5 minutes",
      notifyUser: false,
      logger: console,
    });
  } catch (e) {
    console.warn("[updater] init failed:", (e as Error).message);
  }
}

bootstrap();
