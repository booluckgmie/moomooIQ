# day-trader-skill ("The Trader skill v2", third-party)

- Source: https://github.com/Jakeschincariol/day-trader-skill (MIT, see LICENSE next to this file)
- Pinned commit: 3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd ("The Trader skill v2: 11 day-trading skills")
- Installed: 2026-11-05, project-local in `.claude/skills/trader-*` (tests and README not copied)
- It is the sequel to `trader-skill` (see ../trader-skill/PROVENANCE.md). Both packs use the same folder names, so they
  are merged in place. **Current state of `.claude/skills/`:**

| folder | from | note |
| --- | --- | --- |
| trader-scanner, trader-entry, trader-exit, trader-timemachine | v2 | new in v2 (day trading) |
| trader-alerts, trader-analyst, trader-broker, trader-budget, trader-news, trader-pelosi, trader-risk | v2 | replaced the v1 copies |
| trader-copycat, trader-rebalance, trader-screener, trader-tax | v1 (`trader-skill@5189e79`) | dropped by v2; kept unchanged |

- Reviewed before install (2026-11-05): standard-library Python only; network limited to public data hosts (Yahoo Finance
  chart, SEC EDGAR, House Clerk, Nasdaq Trader symbol lists, Stooq, NYSE calendar); the single subprocess call is
  `pdftotext` on a downloaded PDF; zip files are read in memory, never extracted; no eval/exec/pickle/base64/sockets;
  env vars read: SEC_USER_AGENT only. The approval rules are unchanged from v1 word for word: no order without three gates
  (risk PASS for that exact order, the user's typed yes for that one order, Claude's own Allow-once card), never "yes to all",
  never from a scheduled/background task, order tools stay on "Needs approval". Alerts only ring; nothing in the code can
  reach a broker (`ticket.py` only formats tickets).
- Verified after install: 15 scripts compile; v2's 315 offline tests pass; v1's tests for the 4 kept skills pass.
- Looser default to know about: `max_position_pct` 75 (v1: 25) and `max_order_usd` 4000 (v1: 2000), sized for single-stock day
  trades. New limits tighten other things (max loss per trade, daily loss, trades per day, entry window). Paper trading,
  no margin, no shorts, no options remain the defaults.

## Using the v1-only skills with v2's risk check (tested)
v2 `trader-risk` treats a buy as a day-trade entry. For the older investing flows (rebalance, tax, copycat, screener):
- sells and exits always PASS (they are never blocked by day limits);
- a buy with no stop-loss is BLOCKED unless `"require_stop": false` is set in `trader/config.json` (then it is only a warning);
- entries are blocked outside the US session window (09:30 to 16:00 New York) by design.

## Scope
US markets only (Nasdaq/NYSE symbols, Yahoo US bars, NYSE hours, SEC filings, Alpaca/IBKR). NOT for Bursa Malaysia stocks:
use the `moomoo-*` skills and this app. The Bursa-specific ideas adapted from this pack live in `lib/odds.js`, `lib/prices.js`
and `public/tracker.js` (reality check, typo guard, stop vs daily swing), written from scratch for daily Bursa bars.

## To update
Re-clone, diff against the pinned commit, re-review the diff (especially `trader-broker` and `trader-risk` wording), then replace the
folders and bump the commit here.
