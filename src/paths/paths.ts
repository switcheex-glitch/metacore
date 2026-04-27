import { app } from "electron";
import path from "node:path";
import os from "node:os";

export function userDataDir(): string {
  return app.getPath("userData");
}

export function metacoreAppsDir(): string {
  return path.join(os.homedir(), "metacore-apps");
}

export function desktopDir(): string {
  try {
    return app.getPath("desktop");
  } catch {
    return path.join(os.homedir(), "Desktop");
  }
}

export function settingsFilePath(): string {
  return path.join(userDataDir(), "user-settings.json");
}

export function databaseFilePath(): string {
  return path.join(userDataDir(), "metacore.sqlite");
}

export function logsDir(): string {
  return path.join(userDataDir(), "logs");
}

export function backupsDir(): string {
  return path.join(userDataDir(), "backups");
}

export function appDir(slug: string): string {
  return path.join(metacoreAppsDir(), slug);
}
