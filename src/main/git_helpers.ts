import * as git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";

const AUTHOR = { name: "Metacore", email: "noreply@metacore.local" };

export type CommitResult = { oid: string; message: string };

function walkFiles(root: string, rel = ""): string[] {
  const abs = path.join(root, rel);
  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) return [rel];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs)) {
    if (entry === ".git") continue;
    if (entry === "node_modules") continue;
    if (entry === "dist" || entry === ".vite") continue;
    out.push(...walkFiles(root, path.posix.join(rel, entry)));
  }
  return out;
}

export async function gitInit(dir: string) {
  await git.init({ fs, dir, defaultBranch: "main" });
}

export async function gitAddAll(dir: string) {
  const files = walkFiles(dir);
  for (const filepath of files) {
    await git.add({ fs, dir, filepath });
  }
}

export async function gitRemove(dir: string, filepath: string) {
  try {
    await git.remove({ fs, dir, filepath });
  } catch {
    // already removed from index
  }
}

export async function gitCommit(dir: string, message: string): Promise<CommitResult> {
  const oid = await git.commit({ fs, dir, message, author: AUTHOR });
  return { oid, message };
}

export async function gitLog(dir: string, depth = 50) {
  return git.log({ fs, dir, depth });
}

export async function gitCheckout(dir: string, oid: string) {
  await git.checkout({ fs, dir, ref: oid, force: true });
}

export async function gitCurrentOid(dir: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    return null;
  }
}

export async function gitResetHardTo(dir: string, oid: string) {
  const branch = (await git.currentBranch({ fs, dir, fullname: false })) ?? "main";
  await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: oid, force: true });
  await git.checkout({ fs, dir, ref: branch, force: true });
}

export async function gitListChangedPaths(
  dir: string,
  oid: string,
): Promise<{ added: string[]; modified: string[]; deleted: string[] }> {
  const commits = await git.log({ fs, dir, ref: oid, depth: 2 });
  const current = commits[0];
  const parent = commits[1];
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  if (!current) return { added, modified, deleted };

  const currentFiles = await collectTreeFiles(dir, current.oid);
  const parentFiles = parent ? await collectTreeFiles(dir, parent.oid) : new Map<string, string>();

  for (const [path, oid] of currentFiles) {
    const prev = parentFiles.get(path);
    if (prev === undefined) added.push(path);
    else if (prev !== oid) modified.push(path);
  }
  for (const path of parentFiles.keys()) {
    if (!currentFiles.has(path)) deleted.push(path);
  }
  return { added, modified, deleted };
}

async function collectTreeFiles(dir: string, commitOid: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  async function walk(treeOid: string, prefix: string) {
    const { tree } = await git.readTree({ fs, dir, oid: treeOid });
    for (const entry of tree) {
      const full = prefix ? `${prefix}/${entry.path}` : entry.path;
      if (entry.type === "tree") await walk(entry.oid, full);
      else files.set(full, entry.oid);
    }
  }
  const { commit } = await git.readCommit({ fs, dir, oid: commitOid });
  await walk(commit.tree, "");
  return files;
}
