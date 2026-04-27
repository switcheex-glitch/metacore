import { app as electronApp } from "electron";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, versions, type App as DbApp } from "@/db/schema";
import { metacoreAppsDir, appDir, desktopDir } from "@/paths/paths";
import { gitInit, gitAddAll, gitCommit, gitCurrentOid } from "./git_helpers";
import { ensureAiRulesFile } from "@/ai/system_prompt";

function adjectives() {
  return ["gentle", "brave", "witty", "quiet", "sunny", "mellow", "swift", "cozy", "bold", "eager"];
}
function animals() {
  return ["fox", "otter", "lynx", "finch", "crane", "beetle", "moose", "panda", "heron", "whale"];
}
function randomSlug(): string {
  const a = adjectives();
  const b = animals();
  const adj = a[Math.floor(Math.random() * a.length)]!;
  const animal = b[Math.floor(Math.random() * b.length)]!;
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${adj}-${animal}-${suffix}`;
}

function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || randomSlug();
}

function scaffoldSource(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../scaffold"),
    path.resolve(electronApp.getAppPath(), "scaffold"),
    path.resolve(process.resourcesPath ?? "", "scaffold"),
    path.resolve(process.cwd(), "scaffold"),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "package.json"))) return c;
  }
  throw new Error(`scaffold/ not found. Tried: ${candidates.join(", ")}`);
}

async function copyDir(src: string, dest: string, opts: { skipGit?: boolean } = {}) {
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    if (entry.name === ".vite" || entry.name === ".next" || entry.name === ".turbo") continue;
    if (entry.name === "build" || entry.name === "coverage") continue;
    if (opts.skipGit && entry.name === ".git") continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d, opts);
    } else if (entry.isFile()) {
      await fsp.copyFile(s, d);
    }
  }
}

async function ensureUniqueSlug(preferred?: string): Promise<string> {
  const db = getDb();
  if (preferred) {
    const row = await db
      .select({ id: apps.id })
      .from(apps)
      .where(eq(apps.slug, preferred))
      .limit(1);
    if (row.length === 0 && !fs.existsSync(appDir(preferred))) return preferred;
  }
  for (let i = 0; i < 20; i++) {
    const slug = preferred ? `${preferred}-${Math.random().toString(36).slice(2, 6)}` : randomSlug();
    const existingRow = await db
      .select({ id: apps.id })
      .from(apps)
      .where(eq(apps.slug, slug))
      .limit(1);
    const existingDir = fs.existsSync(appDir(slug));
    if (existingRow.length === 0 && !existingDir) return slug;
  }
  throw new Error("Could not generate a unique slug after 20 attempts");
}

export type CreateAppResult = {
  app: DbApp;
  initialCommit: string;
};

export async function createAppFromFiles(
  name: string,
  files: Record<string, string>,
): Promise<CreateAppResult> {
  const db = getDb();
  await fsp.mkdir(metacoreAppsDir(), { recursive: true });
  const slug = await ensureUniqueSlug();
  const projectDir = appDir(slug);
  await fsp.mkdir(projectDir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const safe = rel.replace(/\\/g, "/").replace(/\.\.+/g, ".");
    const abs = path.join(projectDir, safe);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, "utf8");
  }
  ensureAiRulesFile(projectDir);
  await gitInit(projectDir);
  await gitAddAll(projectDir);
  const { oid } = await gitCommit(projectDir, "Metacore: forked from gallery");
  const inserted = await db
    .insert(apps)
    .values({ name: (name || slug).slice(0, 80), slug, path: projectDir })
    .returning();
  const row = inserted[0]!;
  await db.insert(versions).values({
    appId: row.id,
    commitHash: oid,
    summary: "Metacore: forked from gallery",
  });
  return { app: row, initialCommit: oid };
}

export async function createAppFromScaffold(input: { name?: string }): Promise<CreateAppResult> {
  const db = getDb();
  await fsp.mkdir(metacoreAppsDir(), { recursive: true });

  const slug = await ensureUniqueSlug();
  const name = (input.name?.trim() || slug).slice(0, 80);
  const projectDir = appDir(slug);

  await copyDir(scaffoldSource(), projectDir);
  ensureAiRulesFile(projectDir);

  await gitInit(projectDir);
  await gitAddAll(projectDir);
  const { oid } = await gitCommit(projectDir, "Metacore: initial scaffold");

  const inserted = await db
    .insert(apps)
    .values({
      name,
      slug,
      path: projectDir,
    })
    .returning();

  const row = inserted[0]!;
  await db.insert(versions).values({
    appId: row.id,
    commitHash: oid,
    summary: "Metacore: initial scaffold",
  });

  return { app: row, initialCommit: oid };
}

async function resolveUniqueDesktopDir(baseName: string): Promise<{ folder: string; dir: string }> {
  const parent = desktopDir();
  await fsp.mkdir(parent, { recursive: true });
  const first = path.join(parent, baseName);
  if (!fs.existsSync(first)) return { folder: baseName, dir: first };
  for (let i = 2; i < 100; i++) {
    const next = `${baseName} (${i})`;
    const dir = path.join(parent, next);
    if (!fs.existsSync(dir)) return { folder: next, dir };
  }
  throw new Error(`Could not find free folder name on Desktop starting from "${baseName}"`);
}

function normalizeDesktopFolderName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "MetaCore Project";
}

export async function createAppOnDesktop(input: { name: string }): Promise<CreateAppResult> {
  const db = getDb();
  const displayName = (input.name?.trim() || "MetaCore Project").slice(0, 80);
  const folderName = normalizeDesktopFolderName(displayName);
  const { folder, dir: projectDir } = await resolveUniqueDesktopDir(folderName);

  const preferredSlug = slugifyName(folder);
  const slug = await ensureUniqueSlug(preferredSlug);

  await copyDir(scaffoldSource(), projectDir);
  ensureAiRulesFile(projectDir);

  await gitInit(projectDir);
  await gitAddAll(projectDir);
  const { oid } = await gitCommit(projectDir, `Metacore: initial scaffold for ${displayName}`);

  const inserted = await db
    .insert(apps)
    .values({
      name: displayName,
      slug,
      path: projectDir,
    })
    .returning();

  const row = inserted[0]!;
  await db.insert(versions).values({
    appId: row.id,
    commitHash: oid,
    summary: `Metacore: initial scaffold (${displayName})`,
  });

  return { app: row, initialCommit: oid };
}

type DetectedStack = {
  framework: "vite-react" | "next" | "react" | "unknown";
  usesTypeScript: boolean;
  usesTailwind: boolean;
  usesShadcn: boolean;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
};

function detectStack(projectDir: string): DetectedStack {
  const pkgPath = path.join(projectDir, "package.json");
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    // no package.json — unknown stack
  }
  const deps = {
    ...((pkg.dependencies as Record<string, string> | undefined) ?? {}),
    ...((pkg.devDependencies as Record<string, string> | undefined) ?? {}),
  };

  const hasNext = "next" in deps;
  const hasVite = "vite" in deps;
  const hasReact = "react" in deps;

  let framework: DetectedStack["framework"] = "unknown";
  if (hasNext) framework = "next";
  else if (hasVite && hasReact) framework = "vite-react";
  else if (hasReact) framework = "react";

  const usesTypeScript =
    "typescript" in deps ||
    fs.existsSync(path.join(projectDir, "tsconfig.json"));
  const usesTailwind =
    "tailwindcss" in deps ||
    fs.existsSync(path.join(projectDir, "tailwind.config.ts")) ||
    fs.existsSync(path.join(projectDir, "tailwind.config.js"));
  const usesShadcn =
    fs.existsSync(path.join(projectDir, "components.json")) ||
    fs.existsSync(path.join(projectDir, "src", "components", "ui"));

  let packageManager: DetectedStack["packageManager"] = "npm";
  if (fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"))) packageManager = "pnpm";
  else if (fs.existsSync(path.join(projectDir, "yarn.lock"))) packageManager = "yarn";
  else if (fs.existsSync(path.join(projectDir, "bun.lockb"))) packageManager = "bun";

  return { framework, usesTypeScript, usesTailwind, usesShadcn, packageManager };
}

function renderAiRulesFor(stack: DetectedStack): string {
  const frameworkLine =
    stack.framework === "next"
      ? "Next.js (App Router assumed unless /pages is present)"
      : stack.framework === "vite-react"
        ? "Vite + React 18"
        : stack.framework === "react"
          ? "React 18"
          : "Unknown — inspect the project before editing";
  const langLine = stack.usesTypeScript ? "TypeScript" : "JavaScript";
  const stylingLine = stack.usesTailwind
    ? stack.usesShadcn
      ? "Tailwind CSS + shadcn/ui"
      : "Tailwind CSS"
    : "Project-local CSS (no Tailwind detected)";

  const lines = [
    "# AI Rules for this app",
    "",
    `Framework: ${frameworkLine}.`,
    `Language: ${langLine}.`,
    `Styling: ${stylingLine}.`,
    `Package manager: ${stack.packageManager}.`,
    "",
    "- Use relative paths from the project root.",
    "- Do not touch package.json, lockfiles, or build config (vite/next/tsconfig) without an explicit request.",
    "- Prefer editing existing files over creating new ones.",
    "- Keep existing file structure and import aliases intact.",
  ];
  if (stack.usesShadcn) {
    lines.push("- Reuse shadcn/ui components already in src/components/ui before adding new ones.");
  }
  if (stack.framework === "next") {
    lines.push(
      "- Server components are the default; only add `'use client'` when interactivity requires it.",
    );
  }
  return lines.join("\n") + "\n";
}

export async function importExistingApp(input: {
  sourceDir: string;
  name?: string;
}): Promise<CreateAppResult> {
  const db = getDb();
  const src = path.resolve(input.sourceDir);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  await fsp.mkdir(metacoreAppsDir(), { recursive: true });

  const folderName = path.basename(src);
  const name = (input.name?.trim() || folderName).slice(0, 80);
  const preferredSlug = slugifyName(name);
  const slug = await ensureUniqueSlug(preferredSlug);
  const projectDir = appDir(slug);

  if (path.resolve(projectDir) === src) {
    throw new Error("Cannot import an app from its own managed directory");
  }

  await copyDir(src, projectDir, { skipGit: true });

  const stack = detectStack(projectDir);
  const rulesPath = path.join(projectDir, "AI_RULES.md");
  if (!fs.existsSync(rulesPath)) {
    try {
      fs.writeFileSync(rulesPath, renderAiRulesFor(stack), "utf8");
    } catch {
      // best-effort — continue without rules if the directory rejects writes
    }
  }

  await gitInit(projectDir);
  await gitAddAll(projectDir);
  const existingOid = await gitCurrentOid(projectDir);
  let oid = existingOid;
  if (!oid) {
    oid = (await gitCommit(projectDir, `Metacore: import ${name}`)).oid;
  }

  const inserted = await db
    .insert(apps)
    .values({
      name,
      slug,
      path: projectDir,
    })
    .returning();

  const row = inserted[0]!;
  await db.insert(versions).values({
    appId: row.id,
    commitHash: oid,
    summary: `Imported ${name}`,
  });

  return { app: row, initialCommit: oid };
}

export async function listApps(): Promise<DbApp[]> {
  const db = getDb();
  return db.select().from(apps).orderBy(desc(apps.updatedAt));
}

export async function getAppBySlug(slug: string): Promise<DbApp | null> {
  const db = getDb();
  const rows = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function renameApp(slug: string, name: string) {
  const db = getDb();
  await db.update(apps).set({ name }).where(eq(apps.slug, slug));
}

export async function deleteApp(slug: string, removeFiles: boolean) {
  const db = getDb();
  const row = await getAppBySlug(slug);
  if (!row) return;
  if (removeFiles) {
    const { stopApp } = await import("./app_runner");
    try {
      await stopApp(slug);
    } catch {
      // may not be running — ignore
    }
  }
  // Remove the DB row first so the app disappears from the UI immediately.
  // If deleting files fails, the on-disk folder is orphaned but won't block
  // the rest of the UI. The user can retry or clean up manually.
  await db.delete(apps).where(eq(apps.slug, slug));
  if (removeFiles) {
    try {
      await removeDirWithRetry(row.path, 10);
    } catch (e) {
      console.warn(
        `[app_manager] failed to remove project folder ${row.path}:`,
        (e as Error).message,
      );
    }
  }
}

async function removeDirWithRetry(dir: string, attempts: number) {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}
