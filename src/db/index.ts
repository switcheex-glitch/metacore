import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseFilePath, backupsDir } from "@/paths/paths";
import * as schema from "./schema";
import { seedBuiltInProviders } from "./seed";

export type DrizzleDb = LibSQLDatabase<typeof schema>;

let client: Client | null = null;
let db: DrizzleDb | null = null;

function resolveMigrationsFolder(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "../../drizzle"),
    path.join(process.resourcesPath ?? "", "drizzle"),
    path.resolve(app.getAppPath(), "../drizzle"),
    path.resolve(app.getAppPath(), "drizzle"),
    path.resolve(process.cwd(), "drizzle"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

function corruptionSnapshot(file: string) {
  try {
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size > 0 && stat.size < 100) {
      fs.mkdirSync(backupsDir(), { recursive: true });
      const dest = path.join(backupsDir(), `corrupt-${Date.now()}.sqlite`);
      fs.renameSync(file, dest);
    }
  } catch {
    // best-effort; continue
  }
}

export async function initDatabase(): Promise<DrizzleDb> {
  if (db) return db;

  const file = databaseFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  corruptionSnapshot(file);

  client = createClient({ url: `file:${file}` });
  db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  await seedBuiltInProviders(db);

  return db;
}

export function getDb(): DrizzleDb {
  if (!db) throw new Error("Database not initialised. Call initDatabase() first.");
  return db;
}

export async function closeDatabase() {
  client?.close();
  client = null;
  db = null;
}
