# Field Theory LinkedIn

Local-first CLI to sync your LinkedIn saved posts into a JSONL cache plus a SQLite FTS index, inspired by [`afar1/fieldtheory-cli`](https://github.com/afar1/fieldtheory-cli).

Sync and store locally all of your LinkedIn saved posts. Search, classify, and make them available to Claude Code, Codex, or any agent with shell access.

## Install

```bash
npm install -g fieldtheory-linkedin
```

Requires Node.js 20+ and Google Chrome.

## Quick start

```bash
# 1. Sync your saved posts (needs Chrome logged into LinkedIn)
ftli sync

# 2. Search them
ftli search "agentic workflow"

# 3. Classify by category and domain
ftli classify

# 4. Explore
ftli categories
ftli domains
ftli stats
```

On first run, `ftli sync` opens a Chrome window. Log in to LinkedIn if needed, then the sync proceeds automatically.

## Commands

| Command | Description |
|---------|-------------|
| `ftli sync` | Download and sync all saved posts (no API required) |
| `ftli sync --classify` | Sync then classify new posts with LLM |
| `ftli sync --full` | Full history crawl (not just incremental) |
| `ftli search <query>` | Full-text search with BM25 ranking |
| `ftli classify` | Classify by category and domain using LLM |
| `ftli classify --regex` | Classify by category using simple regex |
| `ftli classify --all` | Re-classify all posts, not just new ones |
| `ftli categories` | Show category distribution |
| `ftli domains` | Subject domain distribution |
| `ftli stats` | Top authors, date range, content kinds |
| `ftli list` | Filter by author, date, query |
| `ftli show <id>` | Show one post in detail |
| `ftli index` | Rebuild the search index (preserves classifications) |
| `ftli schedule enable` | Set up daily automatic sync |
| `ftli schedule disable` | Remove the automatic sync schedule |
| `ftli schedule status` | Show current schedule status |
| `ftli status` | Show sync status and data location |
| `ftli path` | Print data directory path |

## Sync options

```bash
ftli sync --headless          # Run without opening a browser window
ftli sync --full              # Deep crawl, ignore catch-up heuristics
ftli sync --classify          # Auto-classify new posts after sync
ftli sync --max-rounds 2000   # Override max scroll rounds (default 1000)
ftli sync --delay-ms 1200     # Override delay between rounds (default 800ms)
ftli sync --max-minutes 60    # Override max runtime (default 45 min)
```

The sync scrolls through your LinkedIn Saved Posts page, scraping posts as they load. It handles both infinite scroll and "Show more" buttons, checkpoints to disk every 25 rounds, and supports collections of 5000+ bookmarks.

## Classification

### Categories

| Category | What it catches |
|----------|----------------|
| tool | GitHub repos, CLI tools, npm packages, open-source projects |
| security | CVEs, vulnerabilities, exploits, supply chain |
| technique | Tutorials, demos, code patterns, "how I built X" |
| launch | Product launches, announcements, "just shipped" |
| research | Papers, studies, academic findings |
| opinion | Takes, analysis, commentary, thought leadership |
| commerce | Products, shopping, physical goods |

The LLM classifier (`ftli classify`) can also create new categories on the fly for posts that don't fit the above.

### Domains

Known domains: `ai`, `finance`, `defense`, `crypto`, `web-dev`, `devops`, `startups`, `health`, `politics`, `design`, `education`, `science`, `hardware`, `gaming`, `media`, `energy`, `legal`, `robotics`, `space`, `career`, `marketing`, `data`, `cybersecurity`

Use `ftli classify` for LLM-powered classification that catches what regex misses.

## Scheduling

```bash
# Sync every morning at 7am
ftli schedule enable

# Sync and classify at 9:30am
ftli schedule enable --time 09:30 --classify

# Check status
ftli schedule status

# Remove schedule
ftli schedule disable
```

On macOS this creates a launchd job. On Linux it uses cron.

## Agent integration

Tell your agent to use the `ftli` CLI:

> "What have I saved about distributed systems in the last year?"

> "I saved several posts about AI agent frameworks. Compare them and pick the best one."

> "Every day please sync my LinkedIn saved posts using ftli."

Works with Claude Code, Codex, or any agent with shell access.

## Data

All data is stored locally at `~/.ft-linkedin-bookmarks/`:

```
~/.ft-linkedin-bookmarks/
  bookmarks.jsonl              # raw bookmark cache (one per line)
  bookmarks.db                 # SQLite FTS5 search index + classifications
  bookmarks-meta.json          # sync metadata
  bookmarks-sync-state.json    # incremental sync state
  browser-profile/             # persistent Chrome profile
  schedule-stdout.log          # scheduled sync output (if enabled)
  schedule-stderr.log          # scheduled sync errors (if enabled)
```

Override the location with `FTLI_DATA_DIR`:

```bash
export FTLI_DATA_DIR=/path/to/custom/dir
```

To remove all data: `rm -rf ~/.ft-linkedin-bookmarks`

## Environment variables

| Variable | Description |
|----------|-------------|
| `FTLI_DATA_DIR` | Override default data directory |
| `FTLI_CHROME_PATH` | Override Chrome/Chromium binary path |
| `FTLI_SAVED_POSTS_URL` | Override the LinkedIn saved posts page URL |

## Caveats

- LinkedIn does not expose a public bookmarks API, so this relies on browser automation and DOM scraping.
- LinkedIn frequently changes markup. Selectors may need maintenance over time.
- The first sync is interactive if you need to log in.
- LLM classification requires the [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) or Codex CLI to be installed.

## License

MIT
