import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { apps, chats, messages, versions } from "@/db/schema";
import {
  gitCurrentOid,
  gitLog,
  gitResetHardTo,
  gitListChangedPaths,
} from "./git_helpers";

export type VersionEntry = {
  commitHash: string;
  shortHash: string;
  message: string;
  summary: string | null;
  timestamp: number;
  author: string;
  changedPaths: { added: string[]; modified: string[]; deleted: string[] } | null;
  isCurrent: boolean;
  isLatest: boolean;
  dbVersionId: number | null;
};

async function getAppBySlug(slug: string) {
  const db = getDb();
  const rows = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function listVersions(slug: string, limit = 50): Promise<VersionEntry[]> {
  const app = await getAppBySlug(slug);
  if (!app) return [];
  const db = getDb();

  const logRows = await gitLog(app.path, limit);
  const currentOid = await gitCurrentOid(app.path);
  const dbRows = await db
    .select()
    .from(versions)
    .where(eq(versions.appId, app.id));

  const dbByHash = new Map(dbRows.map((v) => [v.commitHash, v]));

  const entries: VersionEntry[] = [];
  for (let i = 0; i < logRows.length; i++) {
    const l = logRows[i]!;
    const hash = l.oid;
    const author = l.commit.author.name;
    const ts = l.commit.author.timestamp * 1000;
    const messageFull = l.commit.message.trim();
    const firstLine = messageFull.split("\n")[0] ?? messageFull;

    const dbRow = dbByHash.get(hash) ?? null;

    entries.push({
      commitHash: hash,
      shortHash: hash.slice(0, 7),
      message: firstLine,
      summary: dbRow?.summary ?? null,
      timestamp: ts,
      author,
      changedPaths: null,
      isCurrent: hash === currentOid,
      isLatest: i === 0,
      dbVersionId: dbRow?.id ?? null,
    });
  }
  return entries;
}

export async function getVersionDetail(slug: string, commitHash: string) {
  const app = await getAppBySlug(slug);
  if (!app) throw new Error(`App not found: ${slug}`);
  const changed = await gitListChangedPaths(app.path, commitHash);
  return changed;
}

export type RevertResult = {
  commitHash: string;
  rewoundCount: number;
};

export async function revertToVersion(slug: string, commitHash: string): Promise<RevertResult> {
  const app = await getAppBySlug(slug);
  if (!app) throw new Error(`App not found: ${slug}`);

  const log = await gitLog(app.path, 200);
  const targetIndex = log.findIndex((l) => l.oid === commitHash);
  if (targetIndex === -1) throw new Error(`Commit not found in history: ${commitHash}`);
  const rewoundHashes = log.slice(0, targetIndex).map((l) => l.oid);

  await gitResetHardTo(app.path, commitHash);

  const db = getDb();
  if (rewoundHashes.length > 0) {
    await db
      .delete(versions)
      .where(and(eq(versions.appId, app.id), inArray(versions.commitHash, rewoundHashes)));
    await db
      .update(messages)
      .set({ commitHash: null })
      .where(inArray(messages.commitHash, rewoundHashes));
  }

  return { commitHash, rewoundCount: rewoundHashes.length };
}

export async function undoLastTurn(slug: string): Promise<RevertResult | null> {
  const app = await getAppBySlug(slug);
  if (!app) throw new Error(`App not found: ${slug}`);
  const log = await gitLog(app.path, 5);
  if (log.length < 2) return null;
  const target = log[1]!;
  const result = await revertToVersion(slug, target.oid);

  const db = getDb();
  const chatRows = await db.select().from(chats).where(eq(chats.appId, app.id));
  for (const chat of chatRows) {
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chat.id))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(2);
    if (msgs.length === 0) continue;
    const [latest, prev] = msgs;
    if (latest && latest.role === "assistant") {
      await db.delete(messages).where(eq(messages.id, latest.id));
      if (prev && prev.role === "user") {
        await db.delete(messages).where(eq(messages.id, prev.id));
      }
      break;
    }
  }

  return result;
}

export async function recordVersion(
  appId: number,
  commitHash: string,
  summary: string | null,
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: versions.id })
    .from(versions)
    .where(and(eq(versions.appId, appId), eq(versions.commitHash, commitHash)))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(versions).values({ appId, commitHash, summary });
}
