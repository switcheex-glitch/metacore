import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./types";

const MAX_BYTES = 200_000;

export function resolveInside(projectDir: string, rel: string): string {
  const normalized = rel.replace(/^\.?\/+/, "").replace(/\\/g, "/");
  const abs = path.resolve(projectDir, normalized);
  const rootAbs = path.resolve(projectDir);
  const relFromRoot = path.relative(rootAbs, abs);
  if (relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
    throw new Error(`Path escapes project root: ${rel}`);
  }
  return abs;
}

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file, relative to the project root. Returns at most 200KB.",
  schema: z
    .object({
      path: z.string().min(1),
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
    })
    .strict(),
  defaultConsent: "always",
  readOnly: true,
  async execute({ path: rel, startLine, endLine }, ctx) {
    const abs = resolveInside(ctx.projectDir, rel);
    const stat = await fsp.stat(abs);
    if (stat.size > MAX_BYTES) {
      const fd = await fsp.open(abs, "r");
      try {
        const buf = Buffer.alloc(MAX_BYTES);
        await fd.read(buf, 0, MAX_BYTES, 0);
        return {
          path: rel,
          truncated: true,
          content: buf.toString("utf8"),
        };
      } finally {
        await fd.close();
      }
    }
    const full = await fsp.readFile(abs, "utf8");
    if (startLine || endLine) {
      const lines = full.split(/\r?\n/);
      const from = Math.max(1, startLine ?? 1) - 1;
      const to = Math.min(lines.length, endLine ?? lines.length);
      return { path: rel, content: lines.slice(from, to).join("\n") };
    }
    return { path: rel, content: full };
  },
};

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description:
    "Create or overwrite a file with the given content. Always provide the full file body, not a diff.",
  schema: z
    .object({
      path: z.string().min(1),
      content: z.string(),
      description: z.string().max(200).optional(),
    })
    .strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ path: rel, description, content }) {
    return {
      summary: `Write ${rel} (${content.length} chars)`,
      detail: description,
    };
  },
  async execute({ path: rel, content }, ctx) {
    const abs = resolveInside(ctx.projectDir, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, content, "utf8");
    return { path: rel, bytes: Buffer.byteLength(content, "utf8") };
  },
};

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Replace a single unique block of text inside an existing file. `oldText` must appear exactly once.",
  schema: z
    .object({
      path: z.string().min(1),
      oldText: z.string().min(1),
      newText: z.string(),
    })
    .strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ path: rel }) {
    return { summary: `Edit ${rel}` };
  },
  async execute({ path: rel, oldText, newText }, ctx) {
    const abs = resolveInside(ctx.projectDir, rel);
    const current = await fsp.readFile(abs, "utf8");
    const idx = current.indexOf(oldText);
    if (idx === -1) throw new Error(`oldText not found in ${rel}`);
    if (current.indexOf(oldText, idx + oldText.length) !== -1) {
      throw new Error(`oldText appears multiple times in ${rel} — use a more specific block`);
    }
    const next = current.slice(0, idx) + newText + current.slice(idx + oldText.length);
    await fsp.writeFile(abs, next, "utf8");
    return { path: rel, replaced: 1 };
  },
};

export const searchReplaceTool: ToolDefinition = {
  name: "search_replace",
  description:
    "Replace every occurrence of a literal string inside a file. Use regex via `isRegex: true` if needed.",
  schema: z
    .object({
      path: z.string().min(1),
      search: z.string().min(1),
      replace: z.string(),
      isRegex: z.boolean().optional(),
      flags: z.string().optional(),
    })
    .strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ path: rel, search, isRegex }) {
    return {
      summary: `search_replace in ${rel} (${isRegex ? "regex" : "literal"})`,
      detail: search.length > 80 ? search.slice(0, 80) + "…" : search,
    };
  },
  async execute({ path: rel, search, replace, isRegex, flags }, ctx) {
    const abs = resolveInside(ctx.projectDir, rel);
    const current = await fsp.readFile(abs, "utf8");
    let next = current;
    let count = 0;
    if (isRegex) {
      const re = new RegExp(search, flags ?? "g");
      next = current.replace(re, () => {
        count++;
        return replace;
      });
    } else {
      const parts = current.split(search);
      count = parts.length - 1;
      next = parts.join(replace);
    }
    if (count === 0) throw new Error(`No matches for search string in ${rel}`);
    await fsp.writeFile(abs, next, "utf8");
    return { path: rel, replaced: count };
  },
};

export const deleteFileTool: ToolDefinition = {
  name: "delete_file",
  description: "Delete a file from the project.",
  schema: z.object({ path: z.string().min(1) }).strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ path: rel }) {
    return { summary: `Delete ${rel}` };
  },
  async execute({ path: rel }, ctx) {
    const abs = resolveInside(ctx.projectDir, rel);
    await fsp.rm(abs, { force: true });
    return { path: rel, deleted: true };
  },
};

export const renameFileTool: ToolDefinition = {
  name: "rename_file",
  description: "Rename or move a file. Creates parent directories if needed.",
  schema: z
    .object({
      from: z.string().min(1),
      to: z.string().min(1),
    })
    .strict(),
  defaultConsent: "ask",
  readOnly: false,
  getConsentPreview({ from, to }) {
    return { summary: `Rename ${from} → ${to}` };
  },
  async execute({ from, to }, ctx) {
    const src = resolveInside(ctx.projectDir, from);
    const dst = resolveInside(ctx.projectDir, to);
    if (!fs.existsSync(src)) throw new Error(`Source not found: ${from}`);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(src, dst);
    return { from, to };
  },
};
