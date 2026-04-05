import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function dataDir(): string {
  return process.env.FTLI_DATA_DIR || path.join(os.homedir(), ".ft-linkedin-bookmarks");
}

export function ensureDataDir(): string {
  const dir = dataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function bookmarksCachePath(): string {
  return path.join(dataDir(), "bookmarks.jsonl");
}

export function bookmarksMetaPath(): string {
  return path.join(dataDir(), "bookmarks-meta.json");
}

export function bookmarksIndexPath(): string {
  return path.join(dataDir(), "bookmarks.db");
}

export function bookmarksSyncStatePath(): string {
  return path.join(dataDir(), "bookmarks-sync-state.json");
}

export function browserProfileDir(): string {
  return path.join(dataDir(), "browser-profile");
}

export function isFirstRun(): boolean {
  return !fs.existsSync(bookmarksCachePath());
}
