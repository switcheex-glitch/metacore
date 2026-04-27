import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { MetacoreTag } from "@/ai/response_processor";
import { gitAddAll, gitRemove, gitCommit, type CommitResult } from "./git_helpers";

export type ApplyResult = {
  changedFiles: string[];
  renamed: Array<{ from: string; to: string }>;
  deleted: string[];
  commit: CommitResult | null;
  skippedDependencies: string[][];
  skippedSql: string[];
  requestedCommands: Array<"rebuild" | "restart">;
  searchReplaceFailures: Array<{ path: string; reason: string }>;
};

function resolveInside(projectDir: string, rel: string): string {
  const normalized = rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
  const abs = path.resolve(projectDir, normalized);
  const root = path.resolve(projectDir);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error(`Path escapes project directory: ${rel}`);
  }
  return abs;
}

async function writeFile(projectDir: string, rel: string, content: string) {
  const abs = resolveInside(projectDir, rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, content, "utf8");
}

async function deleteFile(projectDir: string, rel: string) {
  const abs = resolveInside(projectDir, rel);
  if (fs.existsSync(abs)) {
    await fsp.rm(abs, { force: true });
  }
}

async function renameFile(projectDir: string, from: string, to: string) {
  const src = resolveInside(projectDir, from);
  const dest = resolveInside(projectDir, to);
  if (!fs.existsSync(src)) return;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.rename(src, dest);
}

async function applySearchReplace(
  projectDir: string,
  rel: string,
  search: string,
  replace: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const abs = resolveInside(projectDir, rel);
  if (!fs.existsSync(abs)) return { ok: false, reason: "file does not exist" };
  const body = await fsp.readFile(abs, "utf8");
  if (!body.includes(search)) {
    return { ok: false, reason: "SEARCH block did not match file contents" };
  }
  const updated = body.replace(search, replace);
  await fsp.writeFile(abs, updated, "utf8");
  return { ok: true };
}

export async function applyMetacoreTags(
  projectDir: string,
  tags: MetacoreTag[],
  commitMessage: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    changedFiles: [],
    renamed: [],
    deleted: [],
    commit: null,
    skippedDependencies: [],
    skippedSql: [],
    requestedCommands: [],
    searchReplaceFailures: [],
  };

  for (const tag of tags) {
    switch (tag.kind) {
      case "write":
        await writeFile(projectDir, tag.path, tag.content);
        result.changedFiles.push(tag.path);
        break;
      case "search-replace": {
        const outcome = await applySearchReplace(projectDir, tag.path, tag.search, tag.replace);
        if (outcome.ok) {
          result.changedFiles.push(tag.path);
        } else {
          result.searchReplaceFailures.push({ path: tag.path, reason: outcome.reason });
        }
        break;
      }
      case "rename":
        await renameFile(projectDir, tag.from, tag.to);
        result.renamed.push({ from: tag.from, to: tag.to });
        try {
          await gitRemove(projectDir, tag.from.replace(/\\/g, "/"));
        } catch {
          // ignore if not tracked
        }
        break;
      case "delete":
        await deleteFile(projectDir, tag.path);
        result.deleted.push(tag.path);
        try {
          await gitRemove(projectDir, tag.path.replace(/\\/g, "/"));
        } catch {
          // ignore if not tracked
        }
        break;
      case "add-dependency":
        result.skippedDependencies.push(tag.packages);
        break;
      case "command":
        result.requestedCommands.push(tag.command);
        break;
      case "create-app":
        // Handled upstream in chat_stream_handlers before tags reach here.
        break;
      case "execute-sql":
        result.skippedSql.push(tag.sql);
        break;
    }
  }

  const hasFileChanges =
    result.changedFiles.length + result.renamed.length + result.deleted.length > 0;
  if (!hasFileChanges) return result;

  await gitAddAll(projectDir);
  result.commit = await gitCommit(projectDir, commitMessage);
  return result;
}
