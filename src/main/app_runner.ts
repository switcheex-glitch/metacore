import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { safeSend } from "@/ipc/ipc_host";
import type { WebContents } from "electron";

const BASE_PORT = 32100;
const MAX_PORT_SEARCH = 100;
const BOOT_LINE_RE = /https?:\/\/(localhost|127\.0\.0\.1):(\d+)/i;
const ERROR_LINE_RE = /(error|failed|uncaught|unhandled|ENOENT|EADDR)/i;
const READY_PROBE_INTERVAL_MS = 500;
const READY_PROBE_TIMEOUT_MS = 90_000;

export type AppLogKind = "stdout" | "stderr" | "system";
export type AppLogLine = {
  appSlug: string;
  kind: AppLogKind;
  line: string;
  ts: number;
};

type Running = {
  slug: string;
  projectDir: string;
  child: ChildProcess;
  port: number;
  startedAt: number;
  url: string | null;
  lastError: string | null;
  buffer: AppLogLine[];
  readyProbeTimer: NodeJS.Timeout | null;
};

const running = new Map<string, Running>();
const subscribers = new Set<WebContents>();

function pushLog(entry: AppLogLine) {
  const r = running.get(entry.appSlug);
  if (r) {
    r.buffer.push(entry);
    if (r.buffer.length > 500) r.buffer.splice(0, r.buffer.length - 500);
    if (entry.kind === "stderr" && ERROR_LINE_RE.test(entry.line) && !r.lastError) {
      r.lastError = entry.line;
      broadcast({ type: "error-detected", appSlug: entry.appSlug, message: entry.line });
    }
    const urlMatch = entry.line.match(BOOT_LINE_RE);
    if (urlMatch && !r.url) {
      markReady(r, `http://localhost:${urlMatch[2]}`);
    }
  }
  for (const wc of subscribers) safeSend(wc, "app:log", entry);
}

function markReady(r: Running, url: string) {
  if (r.url) return;
  r.url = url;
  if (r.readyProbeTimer) {
    clearInterval(r.readyProbeTimer);
    r.readyProbeTimer = null;
  }
  broadcast({ type: "ready", appSlug: r.slug, url });
}

function probeOnce(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/", timeout: 1500 },
      (res) => {
        res.resume();
        resolve((res.statusCode ?? 0) > 0);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startReadyProbe(r: Running) {
  const deadline = Date.now() + READY_PROBE_TIMEOUT_MS;
  r.readyProbeTimer = setInterval(async () => {
    if (r.url) {
      if (r.readyProbeTimer) {
        clearInterval(r.readyProbeTimer);
        r.readyProbeTimer = null;
      }
      return;
    }
    if (Date.now() > deadline) {
      if (r.readyProbeTimer) {
        clearInterval(r.readyProbeTimer);
        r.readyProbeTimer = null;
      }
      return;
    }
    const alive = await probeOnce(r.port);
    if (alive && !r.url) {
      markReady(r, `http://localhost:${r.port}`);
    }
  }, READY_PROBE_INTERVAL_MS);
}

type RunnerEvent =
  | { type: "ready"; appSlug: string; url: string }
  | { type: "exit"; appSlug: string; code: number | null }
  | { type: "error-detected"; appSlug: string; message: string };

function broadcast(event: RunnerEvent) {
  for (const wc of subscribers) safeSend(wc, "app:event", event);
}

export function subscribeRunner(wc: WebContents) {
  subscribers.add(wc);
  wc.once("destroyed", () => subscribers.delete(wc));
  return () => subscribers.delete(wc);
}

async function findFreePort(start: number): Promise<number> {
  for (let p = start; p < start + MAX_PORT_SEARCH; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(p, "127.0.0.1");
    });
    if (ok) return p;
  }
  throw new Error(`No free port in range ${start}-${start + MAX_PORT_SEARCH}`);
}

function resolveRunner(projectDir: string): { cmd: string; args: (port: number) => string[] } {
  const lock = fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"));
  const npmLock = fs.existsSync(path.join(projectDir, "package-lock.json"));
  if (lock) return { cmd: "pnpm", args: (p) => ["dev", "--port", String(p)] };
  if (npmLock) return { cmd: "npm", args: (p) => ["run", "dev", "--", "--port", String(p)] };
  return { cmd: "npm", args: (p) => ["run", "dev", "--", "--port", String(p)] };
}

function hasNodeModules(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, "node_modules"));
}

async function ensureInstall(slug: string, projectDir: string): Promise<void> {
  if (hasNodeModules(projectDir)) return;
  pushLog({ appSlug: slug, kind: "system", line: "Installing dependencies (first run)…", ts: Date.now() });
  await new Promise<void>((resolve, reject) => {
    const install = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: projectDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    install.stdout?.on("data", (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) pushLog({ appSlug: slug, kind: "stdout", line, ts: Date.now() });
      }
    });
    install.stderr?.on("data", (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) pushLog({ appSlug: slug, kind: "stderr", line, ts: Date.now() });
      }
    });
    install.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited with code ${code}`));
    });
    install.on("error", reject);
  });
}

export async function startApp(slug: string, projectDir: string): Promise<{ port: number }> {
  if (running.has(slug)) return { port: running.get(slug)!.port };
  await ensureInstall(slug, projectDir);

  const port = await findFreePort(BASE_PORT);
  const runner = resolveRunner(projectDir);
  const child = spawn(runner.cmd, runner.args(port), {
    cwd: projectDir,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0", BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const r: Running = {
    slug,
    projectDir,
    child,
    port,
    startedAt: Date.now(),
    url: null,
    lastError: null,
    buffer: [],
    readyProbeTimer: null,
  };
  running.set(slug, r);

  pushLog({ appSlug: slug, kind: "system", line: `Starting on port ${port}…`, ts: Date.now() });
  startReadyProbe(r);

  child.stdout?.on("data", (d: Buffer) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (line.trim()) pushLog({ appSlug: slug, kind: "stdout", line, ts: Date.now() });
    }
  });
  child.stderr?.on("data", (d: Buffer) => {
    for (const line of d.toString().split(/\r?\n/)) {
      if (line.trim()) pushLog({ appSlug: slug, kind: "stderr", line, ts: Date.now() });
    }
  });
  child.on("exit", (code) => {
    if (r.readyProbeTimer) {
      clearInterval(r.readyProbeTimer);
      r.readyProbeTimer = null;
    }
    running.delete(slug);
    pushLog({ appSlug: slug, kind: "system", line: `Process exited with code ${code}`, ts: Date.now() });
    broadcast({ type: "exit", appSlug: slug, code });
  });
  child.on("error", (err) => {
    pushLog({ appSlug: slug, kind: "stderr", line: `spawn error: ${err.message}`, ts: Date.now() });
  });

  return { port };
}

export async function stopApp(slug: string) {
  const r = running.get(slug);
  if (!r) return;
  if (r.readyProbeTimer) {
    clearInterval(r.readyProbeTimer);
    r.readyProbeTimer = null;
  }
  const child = r.child;
  const exited = new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }
    const done = () => resolve();
    child.once("exit", done);
    child.once("close", done);
  });
  try {
    if (process.platform === "win32") {
      // Use taskkill so npm's shell wrapper terminates its node child too.
      spawn("taskkill", ["/pid", String(r.child.pid), "/f", "/t"], { shell: true, windowsHide: true });
    } else {
      r.child.kill("SIGTERM");
    }
  } catch {
    // ignore
  }
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  running.delete(slug);
}

export async function restartApp(slug: string, projectDir: string): Promise<{ port: number }> {
  await stopApp(slug);
  return startApp(slug, projectDir);
}

export function getAppStatus(slug: string): { running: boolean; port: number | null; url: string | null } {
  const r = running.get(slug);
  if (!r) return { running: false, port: null, url: null };
  return { running: true, port: r.port, url: r.url };
}

export function getRecentLogs(slug: string, limit = 200): AppLogLine[] {
  const r = running.get(slug);
  if (!r) return [];
  return r.buffer.slice(-limit);
}

export function stopAllApps() {
  for (const slug of Array.from(running.keys())) {
    stopApp(slug);
  }
}
