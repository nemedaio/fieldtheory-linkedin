# Field Theory LinkedIn

Local-first CLI to sync your LinkedIn saved posts into a JSONL cache plus a SQLite FTS index, inspired by [`afar1/fieldtheory-cli`](https://github.com/afar1/fieldtheory-cli).

This project is an MVP for LinkedIn. It currently focuses on saved posts and articles reachable from LinkedIn's Saved posts / My Items experience.

## What it does

- Opens a persistent Chrome-backed browser profile with Playwright
- Lets you log in to LinkedIn once and reuse that session on later runs
- Scrapes saved posts from the LinkedIn web app
- Stores everything locally in `~/.ft-linkedin-bookmarks/`
- Builds a SQLite FTS5 search index for fast local search

## Quick start

```bash
npm install
npm run build

# first sync
node dist/src/cli.js sync

# or once published globally
ftli sync
ftli search "agentic workflow"
```

## Commands

- `ftli sync` sync LinkedIn saved posts and rebuild the index
- `ftli sync --full` force a deeper crawl instead of stopping once you are caught up
- `ftli index` rebuild the SQLite search index from `bookmarks.jsonl`
- `ftli search <query>` full-text search across saved posts, with author/date filters
- `ftli list` list recent saved posts, with optional query and date filters
- `ftli show <id>` show one saved post in detail
- `ftli stats` show total counts, top authors, and content kinds
- `ftli status` show sync status and data location
- `ftli path` print the data directory

## Notes

- Default data directory: `~/.ft-linkedin-bookmarks`
- Override it with `FTLI_DATA_DIR=/custom/path`
- Override Chrome path with `FTLI_CHROME_PATH=/path/to/chrome`
- Override the LinkedIn page to scrape with `FTLI_SAVED_POSTS_URL=https://www.linkedin.com/my-items/saved-posts/`

## Caveats

- LinkedIn does not expose a stable public bookmarks API for this use case, so this relies on browser automation and DOM scraping.
- LinkedIn frequently changes markup. We should expect selector maintenance over time.
- The first sync is intentionally interactive if you need to log in.
