import { openDb, saveDb } from "./db.js";
import { readJsonLines } from "./fs.js";
import { bookmarksCachePath, bookmarksIndexPath } from "./paths.js";
const SCHEMA_VERSION = 2;
function getSchemaVersion(db) {
    try {
        const rows = db.exec(`SELECT value FROM meta WHERE key = 'schema_version'`);
        return Number(rows[0]?.values?.[0]?.[0] ?? 0);
    }
    catch {
        return 0;
    }
}
function migrateSchema(db) {
    const version = getSchemaVersion(db);
    if (version < 2) {
        // Add classification columns (safe to run even if columns don't exist yet on fresh DBs)
        for (const col of ["categories TEXT", "primary_category TEXT", "domains TEXT", "primary_domain TEXT"]) {
            try {
                db.run(`ALTER TABLE bookmarks ADD COLUMN ${col}`);
            }
            catch { /* column may already exist */ }
        }
    }
}
function initSchema(db) {
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    canonical_url TEXT NOT NULL,
    post_url TEXT NOT NULL,
    text TEXT NOT NULL,
    author_name TEXT,
    author_slug TEXT,
    author_url TEXT,
    posted_at TEXT,
    bookmarked_at TEXT,
    saved_at_label TEXT,
    kind TEXT NOT NULL,
    links_json TEXT,
    synced_at TEXT NOT NULL,
    provider TEXT NOT NULL,
    categories TEXT,
    primary_category TEXT,
    domains TEXT,
    primary_domain TEXT
  )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_author_slug ON bookmarks(author_slug)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_posted_at ON bookmarks(posted_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_primary_category ON bookmarks(primary_category)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_primary_domain ON bookmarks(primary_domain)`);
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
    text,
    author_name,
    author_slug,
    canonical_url,
    content=bookmarks,
    content_rowid=rowid,
    tokenize='porter unicode61'
  )`);
    migrateSchema(db);
    db.run(`REPLACE INTO meta VALUES ('schema_version', '${SCHEMA_VERSION}')`);
}
function parseJsonArray(value) {
    if (typeof value !== "string" || !value.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
    }
    catch {
        return [];
    }
}
function insertRecord(db, record) {
    db.run(`INSERT INTO bookmarks (
      id, canonical_url, post_url, text, author_name, author_slug,
      author_url, posted_at, bookmarked_at, saved_at_label, kind,
      links_json, synced_at, provider
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      canonical_url = excluded.canonical_url,
      post_url = excluded.post_url,
      text = excluded.text,
      author_name = excluded.author_name,
      author_slug = excluded.author_slug,
      author_url = excluded.author_url,
      posted_at = excluded.posted_at,
      bookmarked_at = excluded.bookmarked_at,
      saved_at_label = excluded.saved_at_label,
      kind = excluded.kind,
      links_json = excluded.links_json,
      synced_at = excluded.synced_at,
      provider = excluded.provider`, [
        record.id,
        record.canonicalUrl,
        record.postUrl,
        record.text,
        record.authorName ?? null,
        record.authorSlug ?? null,
        record.authorUrl ?? null,
        record.postedAt ?? null,
        record.bookmarkedAt ?? null,
        record.savedAtLabel ?? null,
        record.kind,
        record.links.length ? JSON.stringify(record.links) : null,
        record.syncedAt,
        record.provider,
    ]);
}
export async function buildIndex() {
    const cachePath = bookmarksCachePath();
    const dbPath = bookmarksIndexPath();
    const records = await readJsonLines(cachePath);
    const db = await openDb(dbPath);
    try {
        initSchema(db);
        const existingIds = new Set();
        const existingRows = db.exec(`SELECT id FROM bookmarks`);
        for (const row of existingRows[0]?.values ?? []) {
            existingIds.add(String(row[0]));
        }
        const newRecords = records.filter((record) => !existingIds.has(record.id));
        if (newRecords.length > 0) {
            db.run("BEGIN TRANSACTION");
            for (const record of newRecords) {
                insertRecord(db, record);
            }
            db.run("COMMIT");
        }
        db.run(`INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')`);
        saveDb(db, dbPath);
        const totalRows = Number(db.exec(`SELECT COUNT(*) FROM bookmarks`)[0]?.values[0]?.[0] ?? 0);
        return { dbPath, recordCount: totalRows, newRecords: newRecords.length };
    }
    finally {
        db.close();
    }
}
export async function searchBookmarks(options) {
    const db = await openDb(bookmarksIndexPath());
    const limit = options.limit ?? 20;
    try {
        const params = [options.query];
        const filters = [`b.rowid IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)`];
        if (options.author) {
            filters.push(`b.author_slug = ? COLLATE NOCASE`);
            params.push(options.author);
        }
        if (options.after) {
            filters.push(`COALESCE(b.bookmarked_at, b.posted_at, b.synced_at) >= ?`);
            params.push(options.after);
        }
        if (options.before) {
            filters.push(`COALESCE(b.bookmarked_at, b.posted_at, b.synced_at) <= ?`);
            params.push(options.before);
        }
        params.push(limit);
        const sql = `
      SELECT
        b.id,
        b.canonical_url,
        b.text,
        b.author_name,
        b.author_slug,
        b.posted_at,
        bm25(bookmarks_fts, 5.0, 2.0, 2.0, 1.0) as score
      FROM bookmarks b
      JOIN bookmarks_fts ON bookmarks_fts.rowid = b.rowid
      WHERE ${filters.join(" AND ")}
      ORDER BY bm25(bookmarks_fts, 5.0, 2.0, 2.0, 1.0) ASC
      LIMIT ?
    `;
        const rows = db.exec(sql, params);
        return (rows[0]?.values ?? []).map((row) => ({
            id: String(row[0]),
            url: String(row[1]),
            text: String(row[2] ?? ""),
            authorName: row[3] ?? undefined,
            authorSlug: row[4] ?? undefined,
            postedAt: row[5] ?? null,
            score: Number(row[6] ?? 0),
        }));
    }
    finally {
        db.close();
    }
}
export async function listBookmarks(limit = 30, offset = 0) {
    return listBookmarksWithFilters({ limit, offset });
}
export async function listBookmarksWithFilters(options = {}) {
    const db = await openDb(bookmarksIndexPath());
    const limit = options.limit ?? 30;
    const offset = options.offset ?? 0;
    try {
        const filters = [];
        const params = [];
        if (options.query) {
            filters.push(`b.rowid IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)`);
            params.push(options.query);
        }
        if (options.author) {
            filters.push(`b.author_slug = ? COLLATE NOCASE`);
            params.push(options.author);
        }
        if (options.after) {
            filters.push(`COALESCE(b.bookmarked_at, b.posted_at, b.synced_at) >= ?`);
            params.push(options.after);
        }
        if (options.before) {
            filters.push(`COALESCE(b.bookmarked_at, b.posted_at, b.synced_at) <= ?`);
            params.push(options.before);
        }
        params.push(limit, offset);
        const rows = db.exec(`SELECT
        id,
        canonical_url,
        text,
        author_name,
        author_slug,
        posted_at,
        bookmarked_at,
        kind,
        links_json
      FROM bookmarks
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY COALESCE(bookmarked_at, posted_at, synced_at) DESC
      LIMIT ?
      OFFSET ?`, params);
        return (rows[0]?.values ?? []).map((row) => ({
            id: String(row[0]),
            url: String(row[1]),
            text: String(row[2] ?? ""),
            authorName: row[3] ?? undefined,
            authorSlug: row[4] ?? undefined,
            postedAt: row[5] ?? null,
            bookmarkedAt: row[6] ?? null,
            kind: String(row[7] ?? "unknown"),
            links: parseJsonArray(row[8]),
            score: 0,
        }));
    }
    finally {
        db.close();
    }
}
export async function getBookmarkById(id) {
    const db = await openDb(bookmarksIndexPath());
    try {
        const rows = db.exec(`SELECT
        id,
        canonical_url,
        text,
        author_name,
        author_slug,
        posted_at,
        bookmarked_at,
        kind,
        links_json
      FROM bookmarks
      WHERE id = ?
      LIMIT 1`, [id]);
        const row = rows[0]?.values?.[0];
        if (!row) {
            return null;
        }
        return {
            id: String(row[0]),
            url: String(row[1]),
            text: String(row[2] ?? ""),
            authorName: row[3] ?? undefined,
            authorSlug: row[4] ?? undefined,
            postedAt: row[5] ?? null,
            bookmarkedAt: row[6] ?? null,
            kind: String(row[7] ?? "unknown"),
            links: parseJsonArray(row[8]),
            score: 0,
        };
    }
    finally {
        db.close();
    }
}
export async function getStats() {
    const db = await openDb(bookmarksIndexPath());
    try {
        const totalBookmarks = Number(db.exec(`SELECT COUNT(*) FROM bookmarks`)[0]?.values[0]?.[0] ?? 0);
        const uniqueAuthors = Number(db.exec(`SELECT COUNT(DISTINCT author_slug) FROM bookmarks WHERE author_slug IS NOT NULL`)[0]?.values[0]?.[0] ?? 0);
        const range = db.exec(`SELECT MIN(posted_at), MAX(posted_at) FROM bookmarks WHERE posted_at IS NOT NULL`)[0]?.values?.[0] ?? [];
        const topAuthorsRows = db.exec(`SELECT COALESCE(author_slug, author_name, 'unknown') AS author, COUNT(*) AS count
       FROM bookmarks
       GROUP BY author
       ORDER BY count DESC
       LIMIT 10`);
        const kindRows = db.exec(`SELECT kind, COUNT(*) AS count
       FROM bookmarks
       GROUP BY kind
       ORDER BY count DESC`);
        return {
            totalBookmarks,
            uniqueAuthors,
            dateRange: {
                earliest: range[0] ?? null,
                latest: range[1] ?? null,
            },
            topAuthors: (topAuthorsRows[0]?.values ?? []).map((row) => ({
                author: String(row[0]),
                count: Number(row[1]),
            })),
            kindBreakdown: (kindRows[0]?.values ?? []).map((row) => ({
                kind: String(row[0] ?? "unknown"),
                count: Number(row[1]),
            })),
        };
    }
    finally {
        db.close();
    }
}
export async function applyRegexClassifications(classifications) {
    const dbPath = bookmarksIndexPath();
    const db = await openDb(dbPath);
    let updated = 0;
    try {
        initSchema(db);
        db.run("BEGIN TRANSACTION");
        for (const [id, result] of classifications) {
            db.run(`UPDATE bookmarks SET categories = ?, primary_category = ?
         WHERE id = ? AND (primary_category IS NULL OR primary_category = 'unclassified')`, [result.categories.join(","), result.primary, id]);
            updated += db.getRowsModified();
        }
        db.run("COMMIT");
        saveDb(db, dbPath);
        return { updated };
    }
    finally {
        db.close();
    }
}
export async function openClassifyDb() {
    const dbPath = bookmarksIndexPath();
    const db = await openDb(dbPath);
    initSchema(db);
    return { db, dbPath };
}
export function saveClassifyDb(db, dbPath) {
    saveDb(db, dbPath);
}
export async function getCategoryCounts() {
    const db = await openDb(bookmarksIndexPath());
    try {
        const rows = db.exec(`SELECT primary_category, COUNT(*) as c FROM bookmarks
       WHERE primary_category IS NOT NULL
       GROUP BY primary_category ORDER BY c DESC`);
        return (rows[0]?.values ?? []).map((row) => ({
            category: String(row[0]),
            count: Number(row[1]),
        }));
    }
    finally {
        db.close();
    }
}
export async function getDomainCounts() {
    const db = await openDb(bookmarksIndexPath());
    try {
        const rows = db.exec(`SELECT primary_domain, COUNT(*) as c FROM bookmarks
       WHERE primary_domain IS NOT NULL
       GROUP BY primary_domain ORDER BY c DESC`);
        return (rows[0]?.values ?? []).map((row) => ({
            domain: String(row[0]),
            count: Number(row[1]),
        }));
    }
    finally {
        db.close();
    }
}
export function formatSearchResults(results) {
    if (results.length === 0) {
        return "No results found.";
    }
    return results
        .map((result, index) => {
        const author = result.authorSlug ? `@${result.authorSlug}` : result.authorName || "unknown";
        const date = result.postedAt ? result.postedAt.slice(0, 10) : "?";
        const snippet = result.text.length > 160 ? `${result.text.slice(0, 157)}...` : result.text;
        return `${index + 1}. [${date}] ${author}\n   ${snippet}\n   ${result.url}`;
    })
        .join("\n\n");
}
