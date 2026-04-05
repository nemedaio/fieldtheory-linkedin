#!/usr/bin/env node
import fs from "node:fs";
import { Command } from "commander";
import {
  buildIndex,
  formatSearchResults,
  getBookmarkById,
  getStats,
  listBookmarksWithFilters,
  searchBookmarks,
} from "./bookmarks-db.js";
import { formatBookmarkStatus, getBookmarkStatusView } from "./bookmarks-service.js";
import { ensureDataDir, isFirstRun, dataDir, bookmarksIndexPath } from "./paths.js";
import { syncLinkedinBookmarks } from "./linkedin.js";

const LOGO = `
   Field Theory LinkedIn
   local-first saved posts CLI
`;

function requireData(): boolean {
  if (isFirstRun()) {
    console.log(`
  No LinkedIn bookmarks synced yet.

  Run:
    ftli sync
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function requireIndex(): boolean {
  if (!requireData()) {
    return false;
  }
  if (!fs.existsSync(bookmarksIndexPath())) {
    console.log(`
  Search index not built yet.

  Run:
    ftli index
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function safe(fn: (...args: any[]) => Promise<void>): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (error) {
      console.error(`\n  Error: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
  };
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name("ftli")
    .description("Sync and search your LinkedIn saved posts locally.")
    .version("0.1.2")
    .showHelpAfterError()
    .hook("preAction", () => {
      console.log(LOGO);
    });

  program
    .command("sync")
    .description("Open LinkedIn, scrape your saved posts, and refresh the local index")
    .option("--headless", "Run browser automation headlessly", false)
    .option("--full", "Force a deeper crawl instead of incremental stop heuristics", false)
    .option("--profile-dir <path>", "Browser profile directory to persist login")
    .option("--saved-posts-url <url>", "Override the LinkedIn saved posts page URL")
    .option("--max-rounds <n>", "Maximum scroll rounds", (value: string) => Number(value), 50)
    .option("--delay-ms <n>", "Delay between scroll rounds", (value: string) => Number(value), 1500)
    .action(
      safe(async (options) => {
        const firstRun = isFirstRun();
        ensureDataDir();

        if (firstRun) {
          console.log(`
  A Chrome-backed browser profile will be created in:
    ${dataDir()}

  If LinkedIn asks you to log in, do that in the opened browser window.
`);
        }

        const result = await syncLinkedinBookmarks({
          headless: Boolean(options.headless),
          full: Boolean(options.full),
          profileDir: options.profileDir ? String(options.profileDir) : undefined,
          savedPostsUrl: options.savedPostsUrl ? String(options.savedPostsUrl) : undefined,
          maxRounds: Number(options.maxRounds) || 50,
          delayMs: Number(options.delayMs) || 1500,
          onProgress: (progress) => {
            const line = `  round ${progress.rounds} | scraped ${progress.scraped} | new ${progress.newAdded}`;
            process.stderr.write(`\r\x1b[K${line}`);
            if (progress.done) {
              process.stderr.write("\n");
            }
          },
        });

        const index = await buildIndex();
        console.log(`\n  Synced ${result.added} new bookmarks (${result.totalBookmarks} total)`);
        console.log(`  Indexed ${index.recordCount} bookmarks`);
        console.log(`  Data: ${result.cachePath}\n`);
      }),
    );

  program
    .command("index")
    .description("Build the SQLite FTS index from the local JSONL cache")
    .action(
      safe(async () => {
        if (!requireData()) {
          return;
        }
        const result = await buildIndex();
        console.log(`Indexed ${result.recordCount} bookmarks (${result.newRecords} new) -> ${result.dbPath}`);
      }),
    );

  program
    .command("search")
    .description("Full-text search across saved LinkedIn posts")
    .argument("<query>", "FTS query")
    .option("--author <slug>", "Filter by LinkedIn author slug")
    .option("--after <date>", "Filter to items on or after YYYY-MM-DD")
    .option("--before <date>", "Filter to items on or before YYYY-MM-DD")
    .option("--limit <n>", "Max results", (value: string) => Number(value), 20)
    .action(
      safe(async (query: string, options) => {
        if (!requireIndex()) {
          return;
        }
        const results = await searchBookmarks({
          query,
          author: options.author ? String(options.author) : undefined,
          after: options.after ? String(options.after) : undefined,
          before: options.before ? String(options.before) : undefined,
          limit: Number(options.limit) || 20,
        });
        console.log(formatSearchResults(results));
      }),
    );

  program
    .command("list")
    .description("List recent saved posts")
    .option("--query <query>", "Optional FTS query")
    .option("--author <slug>", "Filter by LinkedIn author slug")
    .option("--after <date>", "Filter to items on or after YYYY-MM-DD")
    .option("--before <date>", "Filter to items on or before YYYY-MM-DD")
    .option("--limit <n>", "Max results", (value: string) => Number(value), 30)
    .option("--offset <n>", "Offset", (value: string) => Number(value), 0)
    .option("--json", "JSON output", false)
    .action(
      safe(async (options) => {
        if (!requireIndex()) {
          return;
        }
        const items = await listBookmarksWithFilters({
          query: options.query ? String(options.query) : undefined,
          author: options.author ? String(options.author) : undefined,
          after: options.after ? String(options.after) : undefined,
          before: options.before ? String(options.before) : undefined,
          limit: Number(options.limit) || 30,
          offset: Number(options.offset) || 0,
        });
        if (options.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }
        for (const item of items) {
          const author = item.authorSlug ? `@${item.authorSlug}` : item.authorName || "unknown";
          const date = item.postedAt?.slice(0, 10) ?? "?";
          const snippet = item.text.length > 140 ? `${item.text.slice(0, 137)}...` : item.text;
          console.log(`${item.id}  ${author}  ${date}  ${item.kind}`);
          console.log(`  ${snippet}`);
          console.log(`  ${item.url}`);
          console.log();
        }
      }),
    );

  program
    .command("show")
    .description("Show one bookmark in detail")
    .argument("<id>", "Bookmark id")
    .option("--json", "JSON output", false)
    .action(
      safe(async (id: string, options) => {
        if (!requireIndex()) {
          return;
        }
        const item = await getBookmarkById(id);
        if (!item) {
          console.log(`Bookmark not found: ${id}`);
          process.exitCode = 1;
          return;
        }
        if (options.json) {
          console.log(JSON.stringify(item, null, 2));
          return;
        }
        console.log(`${item.id} · ${item.authorSlug ? `@${item.authorSlug}` : item.authorName || "unknown"}`);
        console.log(item.url);
        console.log(item.text);
        if (item.links.length > 0) {
          console.log(`links: ${item.links.join(", ")}`);
        }
      }),
    );

  program
    .command("stats")
    .description("Show bookmark counts and date range")
    .action(
      safe(async () => {
        if (!requireIndex()) {
          return;
        }
        const stats = await getStats();
        console.log(`Bookmarks: ${stats.totalBookmarks}`);
        console.log(`Unique authors: ${stats.uniqueAuthors}`);
        console.log(
          `Date range: ${stats.dateRange.earliest?.slice(0, 10) ?? "?"} to ${stats.dateRange.latest?.slice(0, 10) ?? "?"}`,
        );
        if (stats.topAuthors.length > 0) {
          console.log("\nTop authors:");
          for (const author of stats.topAuthors) {
            console.log(`  ${author.author}: ${author.count}`);
          }
        }
        if (stats.kindBreakdown.length > 0) {
          console.log("\nKinds:");
          for (const kind of stats.kindBreakdown) {
            console.log(`  ${kind.kind}: ${kind.count}`);
          }
        }
      }),
    );

  program
    .command("status")
    .description("Show sync status and local data directory")
    .action(
      safe(async () => {
        if (!requireData()) {
          return;
        }
        const view = await getBookmarkStatusView();
        console.log(formatBookmarkStatus(view));
      }),
    );

  program
    .command("path")
    .description("Print the local data directory")
    .action(() => {
      console.log(dataDir());
    });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
