import { z } from "zod";
import { spawn } from "node:child_process";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import type { ToolDefinition } from "./types";

const SHELL_TIMEOUT_MS = 5 * 60 * 1000;
const SHELL_MAX_OUTPUT = 200_000;

export const runShellTool: ToolDefinition = {
  name: "run_shell",
  description:
    "Run a shell command in the current project directory (cmd on Windows, sh on Unix). Use for tooling that needs actual execution: npm install, pip install, cargo build, cmake, python main.py, go run. Toolchain installers (winget / choco / scoop) are allowed — install missing toolchains yourself when run_shell reports the binary is missing. Returns stdout, stderr, exit code. Times out after 5 minutes. Do not use for long-running dev servers — use <metacore-command type='restart' /> instead.",
  schema: z
    .object({
      command: z.string().min(1).max(4000),
      description: z.string().min(1).max(200),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: false,
  getConsentPreview({ command, description }) {
    return { summary: description, detail: command };
  },
  async execute({ command }, ctx) {
    return await new Promise((resolve) => {
      const isWin = process.platform === "win32";
      const child = spawn(command, {
        cwd: ctx.projectDir,
        shell: true,
        windowsHide: true,
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          if (isWin) spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { windowsHide: true });
          else child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }, SHELL_TIMEOUT_MS);
      child.stdout?.on("data", (b: Buffer) => {
        if (stdout.length < SHELL_MAX_OUTPUT) stdout += b.toString("utf8");
      });
      child.stderr?.on("data", (b: Buffer) => {
        if (stderr.length < SHELL_MAX_OUTPUT) stderr += b.toString("utf8");
      });
      const onAbort = () => {
        try {
          if (isWin) spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { windowsHide: true });
          else child.kill("SIGTERM");
        } catch {
          // ignore
        }
      };
      ctx.signal.addEventListener("abort", onAbort, { once: true });
      child.on("exit", (code, signal) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", onAbort);
        resolve({
          exitCode: code,
          signal,
          timedOut,
          stdout: stdout.slice(-SHELL_MAX_OUTPUT),
          stderr: stderr.slice(-SHELL_MAX_OUTPUT),
        });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener("abort", onAbort);
        resolve({
          exitCode: -1,
          signal: null,
          timedOut,
          stdout,
          stderr: stderr + "\n[spawn error] " + (err as Error).message,
        });
      });
    });
  },
};

export const createDesktopShortcutTool: ToolDefinition = {
  name: "create_desktop_shortcut",
  description:
    "Create a Windows desktop shortcut (.lnk) for a compiled executable. Use after successfully building a user project to .exe, so the user can launch it with one click. Resolves targetPath and iconPath relative to the current project directory.",
  schema: z
    .object({
      name: z.string().min(1).max(80),
      targetPath: z.string().min(1).max(500),
      iconPath: z.string().min(1).max(500).optional(),
      args: z.string().max(500).optional(),
      workingDir: z.string().max(500).optional(),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: false,
  async execute({ name, targetPath, iconPath, args, workingDir }, ctx) {
    if (process.platform !== "win32") {
      return { ok: false, reason: "not_windows" };
    }
    const absTarget = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(ctx.projectDir, targetPath);
    if (!fs.existsSync(absTarget)) {
      return { ok: false, reason: "target_not_found", target: absTarget };
    }
    const desktop = app.getPath("desktop");
    const safeName = name.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "Shortcut";
    const lnkPath = path.join(desktop, `${safeName}.lnk`);
    const absIcon = iconPath
      ? path.isAbsolute(iconPath)
        ? iconPath
        : path.join(ctx.projectDir, iconPath)
      : absTarget;
    const absWorking = workingDir
      ? path.isAbsolute(workingDir)
        ? workingDir
        : path.join(ctx.projectDir, workingDir)
      : path.dirname(absTarget);
    const ps =
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath.replace(/'/g, "''")}'); ` +
      `$s.TargetPath = '${absTarget.replace(/'/g, "''")}'; ` +
      `$s.WorkingDirectory = '${absWorking.replace(/'/g, "''")}'; ` +
      (args ? `$s.Arguments = '${args.replace(/'/g, "''")}'; ` : "") +
      `$s.IconLocation = '${absIcon.replace(/'/g, "''")}'; ` +
      `$s.Save()`;
    return await new Promise((resolve) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-Command", ps], {
        windowsHide: true,
      });
      let stderr = "";
      child.stderr?.on("data", (b: Buffer) => (stderr += b.toString("utf8")));
      child.on("exit", (code) => {
        if (code === 0 && fs.existsSync(lnkPath)) {
          resolve({ ok: true, shortcutPath: lnkPath });
        } else {
          resolve({ ok: false, reason: "powershell_failed", exitCode: code, stderr });
        }
      });
      child.on("error", (e) =>
        resolve({ ok: false, reason: "spawn_error", error: (e as Error).message }),
      );
    });
  },
};

export const addDependencyTool: ToolDefinition = {
  name: "add_dependency",
  description:
    "Queue npm dependencies to be installed on the user's machine. Does not run install immediately; user is expected to run it (or an integration will).",
  schema: z
    .object({
      packages: z.array(z.string().min(1)).min(1),
      dev: z.boolean().optional(),
    })
    .strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ packages, dev }) {
    return {
      summary: `Add ${dev ? "devDependencies" : "dependencies"}: ${packages.join(" ")}`,
    };
  },
  async execute({ packages, dev }) {
    return {
      queued: packages,
      dev: dev ?? false,
      note: "Packages queued. Run `npm install` in the app folder to apply.",
    };
  },
};

export const readLogsTool: ToolDefinition = {
  name: "read_logs",
  description:
    "Read the most recent stdout/stderr lines from the running dev server for the current app.",
  schema: z
    .object({
      limit: z.number().int().min(1).max(500).optional(),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ limit }, ctx) {
    const lines = ctx.readLogs();
    const n = limit ?? 100;
    return { lines: lines.slice(-n) };
  },
};

export const runTypeChecksTool: ToolDefinition = {
  name: "run_type_checks",
  description:
    "Report whether TypeScript errors are currently visible in the dev server logs. This is a lightweight heuristic — not a real tsc run.",
  schema: z.object({}).strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute(_args, ctx) {
    const lines = ctx.readLogs();
    const errors = lines
      .filter((l) => /error TS\d+|Type error:|Syntax error:|Failed to compile/i.test(l))
      .slice(-50);
    return { errorCount: errors.length, errors };
  },
};

export const updateTodosTool: ToolDefinition = {
  name: "update_todos",
  description:
    "Record the AI's current plan as a list of todos that will be surfaced to the user in the chat UI.",
  schema: z
    .object({
      todos: z
        .array(
          z.object({
            content: z.string().min(1).max(200),
            status: z.enum(["pending", "in_progress", "completed"]),
          }),
        )
        .min(1)
        .max(20),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ todos }) {
    return { todos, recorded: true };
  },
};

export const setChatSummaryTool: ToolDefinition = {
  name: "set_chat_summary",
  description:
    "Set a one-line summary that becomes the git commit message for the changes made this turn.",
  schema: z.object({ summary: z.string().min(1).max(200) }).strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ summary }, ctx) {
    ctx.setChatSummary(summary);
    return { summary, saved: true };
  },
};

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description:
    "(Stub) Search the web for a query. Currently returns no results — wire up an external provider later.",
  schema: z.object({ query: z.string().min(1) }).strict(),
  defaultConsent: "ask",
  readOnly: true,
  getConsentPreview({ query }) {
    return { summary: `Web search: ${query}` };
  },
  async execute({ query }) {
    return { query, results: [], note: "web_search is not wired up in this build." };
  },
};

export const webCrawlTool: ToolDefinition = {
  name: "web_crawl",
  description: "(Stub) Fetch and extract readable text from a URL. Not wired in this build.",
  schema: z.object({ url: z.string().url() }).strict(),
  defaultConsent: "ask",
  readOnly: true,
  getConsentPreview({ url }) {
    return { summary: `Fetch ${url}` };
  },
  async execute({ url }) {
    return { url, text: "", note: "web_crawl is not wired up in this build." };
  },
};

export const executeSqlTool: ToolDefinition = {
  name: "execute_sql",
  description:
    "(Stub) Execute a SQL migration against the connected Supabase/Neon project. Not wired in this build.",
  schema: z
    .object({ description: z.string().min(1), sql: z.string().min(1) })
    .strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ description, sql }) {
    return { summary: `SQL: ${description}`, detail: sql.slice(0, 200) };
  },
  async execute({ description, sql }) {
    return {
      applied: false,
      description,
      note: "No database integration connected — SQL recorded only.",
      sqlPreview: sql.slice(0, 500),
    };
  },
};

export const getSupabaseProjectInfoTool: ToolDefinition = {
  name: "get_supabase_project_info",
  description: "(Stub) Return metadata about the connected Supabase project.",
  schema: z.object({}).strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute() {
    return { connected: false, note: "Supabase integration not connected." };
  },
};

export const getSupabaseTableSchemaTool: ToolDefinition = {
  name: "get_supabase_table_schema",
  description: "(Stub) Return the schema of a table in the connected Supabase project.",
  schema: z.object({ table: z.string().min(1) }).strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ table }) {
    return { table, columns: [], note: "Supabase integration not connected." };
  },
};

export const addIntegrationTool: ToolDefinition = {
  name: "add_integration",
  description:
    "Signal that the user needs to add an external integration (GitHub / Supabase / Neon / Vercel). Ends the tool loop so the UI can prompt the user.",
  schema: z
    .object({
      integration: z.enum(["github", "supabase", "neon", "vercel"]),
      reason: z.string().min(1).max(400),
    })
    .strict(),
  defaultConsent: "ask",
  readOnly: true,
  getConsentPreview({ integration, reason }) {
    return { summary: `Request ${integration} integration`, detail: reason };
  },
  async execute({ integration, reason }) {
    return { integration, reason, handoff: true };
  },
};
