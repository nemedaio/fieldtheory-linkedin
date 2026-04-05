import { readJsonLines, readJson } from "./fs.js";
import { bookmarksCachePath, bookmarksMetaPath, dataDir } from "./paths.js";
import type { LinkedinBookmarkMeta, LinkedinBookmarkRecord } from "./types.js";

export interface BookmarkStatusView {
  bookmarkCount: number;
  lastUpdated: string | null;
  cachePath: string;
}

export async function getBookmarkStatusView(): Promise<BookmarkStatusView> {
  let meta: LinkedinBookmarkMeta | null = null;
  try {
    meta = await readJson<LinkedinBookmarkMeta>(bookmarksMetaPath());
  } catch {
    meta = null;
  }

  const rows = await readJsonLines<LinkedinBookmarkRecord>(bookmarksCachePath());
  return {
    bookmarkCount: meta?.totalBookmarks ?? rows.length,
    lastUpdated: meta?.lastSyncAt ?? null,
    cachePath: dataDir(),
  };
}

export function formatBookmarkStatus(view: BookmarkStatusView): string {
  return [
    "LinkedIn bookmarks",
    `  bookmarks: ${view.bookmarkCount}`,
    `  last updated: ${view.lastUpdated ?? "never"}`,
    `  data dir: ${view.cachePath}`,
  ].join("\n");
}
