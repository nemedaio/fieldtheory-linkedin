import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { readJsonLines, writeJson, writeJsonLines } from "./fs.js";
import { bookmarksCachePath, bookmarksMetaPath, browserProfileDir, ensureDataDir } from "./paths.js";
import type {
  ExtractedBookmarkCandidate,
  LinkedinBookmarkMeta,
  LinkedinBookmarkRecord,
  SyncProgress,
} from "./types.js";

const DEFAULT_SAVED_POSTS_URL = "https://www.linkedin.com/my-items/saved-posts/";

export interface SyncLinkedinBookmarksOptions {
  headless?: boolean;
  profileDir?: string;
  maxRounds?: number;
  delayMs?: number;
  savedPostsUrl?: string;
  onProgress?: (progress: SyncProgress) => void;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeLinkedinUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("trk") || key === "lipi" || key === "midToken") {
      url.searchParams.delete(key);
    }
  }
  return url.toString().replace(/\/+$/, "");
}

export function bookmarkIdFromUrl(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

function kindFromUrl(url: string): "post" | "article" | "unknown" {
  if (url.includes("/feed/update/") || url.includes("/posts/")) {
    return "post";
  }
  if (url.includes("/pulse/")) {
    return "article";
  }
  return "unknown";
}

function toBookmarkRecord(candidate: ExtractedBookmarkCandidate, syncedAt: string): LinkedinBookmarkRecord {
  const canonicalUrl = normalizeLinkedinUrl(candidate.url);
  return {
    id: bookmarkIdFromUrl(canonicalUrl),
    postUrl: candidate.url,
    canonicalUrl,
    text: normalizeWhitespace(candidate.text),
    authorName: candidate.authorName ? normalizeWhitespace(candidate.authorName) : undefined,
    authorSlug: candidate.authorSlug || undefined,
    authorUrl: candidate.authorUrl || undefined,
    postedAt: candidate.postedAt ?? null,
    bookmarkedAt: null,
    savedAtLabel: candidate.savedAtLabel ?? null,
    kind: candidate.kind || kindFromUrl(candidate.url),
    links: [...new Set(candidate.links.map((link) => normalizeLinkedinUrl(new URL(link, "https://www.linkedin.com").toString())))],
    syncedAt,
    provider: "linkedin",
  };
}

function findChromeExecutable(): string | undefined {
  if (process.env.FTLI_CHROME_PATH) {
    return process.env.FTLI_CHROME_PATH;
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function waitForManualLogin(page: Page, savedPostsUrl: string): Promise<void> {
  const rl = createInterface({ input, output });
  console.log("\n  A browser window has been opened for LinkedIn.");
  console.log("  Log in if needed, then open your Saved posts page.");
  console.log(`  Target page: ${savedPostsUrl}\n`);
  await rl.question("  Press Enter here once the Saved posts page is visible...");
  rl.close();
}

async function gotoSavedPosts(page: Page, savedPostsUrl: string): Promise<void> {
  await page.goto(savedPostsUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

async function ensureReadyForScrape(page: Page, savedPostsUrl: string): Promise<void> {
  await gotoSavedPosts(page, savedPostsUrl);

  const needsLogin = page.url().includes("/login") || Boolean(await page.locator('input[name="session_key"]').count());
  if (needsLogin) {
    await waitForManualLogin(page, savedPostsUrl);
    await gotoSavedPosts(page, savedPostsUrl);
  }
}

async function openLinkedinContext(profileDir: string, headless: boolean): Promise<BrowserContext> {
  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error(
      "Could not find a local Chrome/Chromium executable. Set FTLI_CHROME_PATH to your browser binary.",
    );
  }
  return chromium.launchPersistentContext(profileDir, {
    headless,
    executablePath,
    viewport: { width: 1400, height: 1100 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function scrapeVisibleCandidates(page: Page): Promise<ExtractedBookmarkCandidate[]> {
  return page.evaluate(() => {
    const ABSOLUTE_BASE = "https://www.linkedin.com";
    const postAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/pulse/"]'),
    );

    const seen = new Set<string>();
    const items: ExtractedBookmarkCandidate[] = [];

    const toAbsolute = (value: string): string => {
      try {
        return new URL(value, ABSOLUTE_BASE).toString();
      } catch {
        return value;
      }
    };

    const clean = (value: string | null | undefined): string | undefined => {
      if (!value) {
        return undefined;
      }
      const normalized = value.replace(/\s+/g, " ").trim();
      return normalized || undefined;
    };

    for (const anchor of postAnchors) {
      const url = toAbsolute(anchor.href);
      if (seen.has(url)) {
        continue;
      }

      const container =
        anchor.closest("article") ||
        anchor.closest("li") ||
        anchor.closest(".artdeco-card") ||
        anchor.closest(".entity-result") ||
        anchor.parentElement;

      if (!container) {
        continue;
      }

      const text = clean((container as HTMLElement).innerText);
      if (!text || text.length < 20) {
        continue;
      }

      const authorAnchor =
        container.querySelector<HTMLAnchorElement>('a[href*="/in/"]') ||
        container.querySelector<HTMLAnchorElement>('a[href*="/company/"]');

      const authorUrl = authorAnchor?.href ? toAbsolute(authorAnchor.href) : undefined;
      const authorSlug = authorUrl
        ? authorUrl
            .replace(/^https?:\/\/www\.linkedin\.com\//, "")
            .replace(/\/+$/, "")
            .split("/")
            .slice(1)
            .join("/")
        : undefined;

      const timeEl = container.querySelector("time");
      const timeLabel = clean(timeEl?.getAttribute("datetime")) || clean(timeEl?.textContent);

      const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .map((link) => toAbsolute(link.href))
        .filter((href) => href.startsWith("http"));

      seen.add(url);
      items.push({
        url,
        text,
        authorName: clean(authorAnchor?.textContent),
        authorSlug,
        authorUrl,
        postedAt: timeLabel ?? null,
        savedAtLabel: clean(
          Array.from(container.querySelectorAll<HTMLElement>("span, div"))
            .map((node) => node.innerText)
            .find((value) => /saved|bookmarked/i.test(value)),
        ),
        links,
        kind: url.includes("/pulse/") ? "article" : url.includes("/feed/update/") || url.includes("/posts/") ? "post" : "unknown",
      });
    }

    return items;
  });
}

async function advanceSavedPostsFeed(page: Page): Promise<void> {
  await page.evaluate(() => {
    const clickLoadMore = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      const button = buttons.find((candidate) => /show more|load more|see more/i.test(candidate.innerText));
      button?.click();
    };

    clickLoadMore();

    const candidates = [
      document.scrollingElement,
      ...Array.from(document.querySelectorAll<HTMLElement>("main, div, section")),
    ].filter((element): element is HTMLElement => Boolean(element));

    const scrollable = candidates
      .filter((element) => element.scrollHeight > element.clientHeight + 200)
      .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];

    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight;
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
}

export async function syncLinkedinBookmarks(
  options: SyncLinkedinBookmarksOptions = {},
): Promise<{ added: number; totalBookmarks: number; cachePath: string }> {
  ensureDataDir();

  const savedPostsUrl = options.savedPostsUrl || process.env.FTLI_SAVED_POSTS_URL || DEFAULT_SAVED_POSTS_URL;
  const profileDir = options.profileDir || browserProfileDir();
  const headless = options.headless ?? false;
  const maxRounds = options.maxRounds ?? 50;
  const delayMs = options.delayMs ?? 1500;

  const existing = await readJsonLines<LinkedinBookmarkRecord>(bookmarksCachePath());
  const existingById = new Map(existing.map((record) => [record.id, record]));

  const context = await openLinkedinContext(profileDir, headless);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await ensureReadyForScrape(page, savedPostsUrl);

    const discovered = new Map<string, LinkedinBookmarkRecord>();
    let stableRounds = 0;
    let previousCount = 0;

    for (let round = 1; round <= maxRounds; round += 1) {
      const syncedAt = new Date().toISOString();
      const candidates = await scrapeVisibleCandidates(page);

      for (const candidate of candidates) {
        const record = toBookmarkRecord(candidate, syncedAt);
        if (record.text.length < 20) {
          continue;
        }
        discovered.set(record.id, record);
      }

      const newAdded = [...discovered.keys()].filter((id) => !existingById.has(id)).length;
      options.onProgress?.({
        rounds: round,
        scraped: discovered.size,
        newAdded,
        done: false,
      });

      if (discovered.size === previousCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      if (stableRounds >= 2) {
        break;
      }

      previousCount = discovered.size;
      await advanceSavedPostsFeed(page);
      await page.waitForTimeout(delayMs);
    }

    const merged = [...existing];
    for (const record of discovered.values()) {
      if (!existingById.has(record.id)) {
        merged.push(record);
      }
    }

    merged.sort((left, right) => {
      const a = left.postedAt || left.syncedAt;
      const b = right.postedAt || right.syncedAt;
      return a < b ? 1 : a > b ? -1 : 0;
    });

    await writeJsonLines(bookmarksCachePath(), merged);

    const meta: LinkedinBookmarkMeta = {
      provider: "linkedin",
      schemaVersion: 1,
      totalBookmarks: merged.length,
      lastSyncAt: new Date().toISOString(),
    };
    await writeJson(bookmarksMetaPath(), meta);

    const added = merged.length - existing.length;
    options.onProgress?.({
      rounds: maxRounds,
      scraped: discovered.size,
      newAdded: added,
      done: true,
    });

    return {
      added,
      totalBookmarks: merged.length,
      cachePath: path.dirname(bookmarksCachePath()),
    };
  } finally {
    await context.close();
  }
}
