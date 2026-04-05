import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export function dataDir() {
    return process.env.FTLI_DATA_DIR || path.join(os.homedir(), ".ft-linkedin-bookmarks");
}
export function ensureDataDir() {
    const dir = dataDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
export function bookmarksCachePath() {
    return path.join(dataDir(), "bookmarks.jsonl");
}
export function bookmarksMetaPath() {
    return path.join(dataDir(), "bookmarks-meta.json");
}
export function bookmarksIndexPath() {
    return path.join(dataDir(), "bookmarks.db");
}
export function bookmarksSyncStatePath() {
    return path.join(dataDir(), "bookmarks-sync-state.json");
}
export function browserProfileDir() {
    return path.join(dataDir(), "browser-profile");
}
export function isFirstRun() {
    return !fs.existsSync(bookmarksCachePath());
}
