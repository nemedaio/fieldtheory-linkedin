import { readJsonLines, readJson } from "./fs.js";
import { bookmarksCachePath, bookmarksMetaPath, dataDir } from "./paths.js";
export async function getBookmarkStatusView() {
    let meta = null;
    try {
        meta = await readJson(bookmarksMetaPath());
    }
    catch {
        meta = null;
    }
    const rows = await readJsonLines(bookmarksCachePath());
    return {
        bookmarkCount: meta?.totalBookmarks ?? rows.length,
        lastUpdated: meta?.lastSyncAt ?? null,
        cachePath: dataDir(),
    };
}
export function formatBookmarkStatus(view) {
    return [
        "LinkedIn bookmarks",
        `  bookmarks: ${view.bookmarkCount}`,
        `  last updated: ${view.lastUpdated ?? "never"}`,
        `  data dir: ${view.cachePath}`,
    ].join("\n");
}
