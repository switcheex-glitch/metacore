import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./types";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vite",
  "build",
  ".next",
  ".turbo",
  "coverage",
]);
const MAX_FILES = 400;
const MAX_MATCHES = 200;

function walk(root: string, rel: string, out: string[], predicate?: (rel: string) => boolean) {
  if (out.length >= MAX_FILES) return;
  const abs = path.join(root, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith(".") && e.name !== ".gitignore" && e.name !== ".env.example") continue;
    const nextRel = rel ? path.posix.join(rel, e.name) : e.name;
    if (e.isDirectory()) walk(root, nextRel, out, predicate);
    else if (e.isFile()) {
      if (!predicate || predicate(nextRel)) out.push(nextRel);
      if (out.length >= MAX_FILES) return;
    }
  }
}

function subtreeRel(root: string, sub: string | undefined): string {
  if (!sub) return "";
  const clean = sub.replace(/^\.?\/+/, "").replace(/\\/g, "/");
  const abs = path.resolve(root, clean);
  const rel = path.relative(path.resolve(root), abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${sub}`);
  }
  return rel;
}

export const listFilesTool: ToolDefinition = {
  name: "list_files",
  description:
    "List files in the project, optionally under a subdirectory. Returns paths relative to the project root.",
  schema: z
    .object({
      subdir: z.string().optional(),
      extension: z.string().optional(),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ subdir, extension }, ctx) {
    const start = subtreeRel(ctx.projectDir, subdir);
    const out: string[] = [];
    walk(
      ctx.projectDir,
      start,
      out,
      extension
        ? (rel) => rel.toLowerCase().endsWith(extension.toLowerCase().startsWith(".") ? extension : `.${extension}`)
        : undefined,
    );
    return { files: out.slice(0, MAX_FILES), truncated: out.length >= MAX_FILES };
  },
};

export const grepTool: ToolDefinition = {
  name: "grep",
  description:
    "Search for a regex pattern in project files. Returns matching paths with line numbers and snippet.",
  schema: z
    .object({
      pattern: z.string().min(1),
      flags: z.string().optional(),
      subdir: z.string().optional(),
      extension: z.string().optional(),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ pattern, flags, subdir, extension }, ctx) {
    const start = subtreeRel(ctx.projectDir, subdir);
    const files: string[] = [];
    walk(
      ctx.projectDir,
      start,
      files,
      extension
        ? (rel) => rel.toLowerCase().endsWith(extension.toLowerCase().startsWith(".") ? extension : `.${extension}`)
        : undefined,
    );
    const re = new RegExp(pattern, flags ?? "");
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const rel of files) {
      if (matches.length >= MAX_MATCHES) break;
      const abs = path.join(ctx.projectDir, rel);
      let text: string;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (re.test(line)) {
          matches.push({ path: rel, line: i + 1, text: line.slice(0, 400) });
          if (matches.length >= MAX_MATCHES) break;
        }
      }
    }
    return { matches, truncated: matches.length >= MAX_MATCHES };
  },
};

export const codeSearchTool: ToolDefinition = {
  name: "code_search",
  description:
    "High-level semantic code search: find files whose filename OR contents include the query (case-insensitive).",
  schema: z
    .object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ query, limit }, ctx) {
    const files: string[] = [];
    walk(ctx.projectDir, "", files);
    const needle = query.toLowerCase();
    const hits: Array<{ path: string; score: number; excerpt?: string }> = [];
    for (const rel of files) {
      let score = 0;
      if (rel.toLowerCase().includes(needle)) score += 5;
      const abs = path.join(ctx.projectDir, rel);
      let excerpt: string | undefined;
      try {
        const text = fs.readFileSync(abs, "utf8");
        const idx = text.toLowerCase().indexOf(needle);
        if (idx !== -1) {
          score += 3;
          const from = Math.max(0, idx - 80);
          const to = Math.min(text.length, idx + needle.length + 80);
          excerpt = text.slice(from, to);
        }
      } catch {
        // skip unreadable
      }
      if (score > 0) hits.push({ path: rel, score, excerpt });
    }
    hits.sort((a, b) => b.score - a.score);
    return { hits: hits.slice(0, limit ?? 20) };
  },
};
