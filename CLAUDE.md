# MoomooIQ

Bursa Malaysia stock analysis SPA (Gemini) plus Claude Code skills for Moomoo OpenAPI.

## Layout
- `public/index.html` (markup) + `public/style.css` + `public/app.js` – SPA. Tabs: **Today** (default: greeting hero with market status and day bar, 3 stat tiles, Do now / Ideas worth a look / Good to know / Your stocks, tip of the day), Research (Gemini), Portfolio (summary + collapsible tools: add, sizing, pre-trade check, Moomoo sync), News, **More** (experience level, connect Moomoo, backup, access code, glossary, how it works, site usage, about). Technical/rare content lives in More on purpose.
- **Experience levels** (`moomooiq.level` = beginner|regular|pro, default regular; `moomooiq.welcomed`): `body[data-level]` + CSS `.show-beg/.show-pro/.hide-pro`, and `BEG()/PRO()` in `app.js`. Beginner shows the `plain` text of each Today item, 'Safety exit' for stop, simpler button labels; pro hides tips/subtitles and shows scores and equity. `data-open="<id>"` on any element opens a card in More/Portfolio (`openCard`). Usage loads on first open of `#dusage`.
- `public/today.js` – pure Today logic: market hours (MYT), next-check time, price freshness, tier building, ranking
- `lib/signals.js` – headline relevance filter + keyword tone/tags (server side); `netlify/functions/brief.js` (+ `api/brief.js`) batches Moomoo news/notices for a ticker list
- `netlify/functions/` – `analyze.js` (Gemini; ONE section per request, the page fires 3 in parallel; retries transient errors, falls back across auto-discovered models, grounds the prompt with today's date + verified Moomoo headlines + the user's price, forbids invented prices), `lib/newsfeed.js` (shared Moomoo fetch + 5-min cache), `public/md.js` (safe markdown renderer for model output), `stocks.js` (universe), `moomoo-news.js` (public Moomoo news API)
- `lib/prices.js` (Yahoo Finance daily bars for Bursa as `<code>.KL`, delayed ~15 min, unofficial, 2 hosts + cache) and `lib/odds.js` (history replay of the 8% stop / +20% target, ATR%, 52-week range; pure maths). Endpoints `/api/quotes` (batch delayed prices) and `/api/odds` (one stock). Idea adapted from the third-party day-trader `trader-timemachine`, rewritten for daily Bursa bars; it is a guide, not a forecast (overlapping windows, one stock, one year).
- `public/tracker.js` – pure portfolio rules engine (stops, ladder, trim, alerts, position sizing [2% risk default, 100-share lots, 1/3 slot cap, RM200 cash buffer], export/import JSON v1 with validation); tests in `tests/`. Positions live in the browser's localStorage only.
- Pre-trade check: `preTradeCheck` in `tracker.js` (slots, RM200 cash buffer, 1/3 cap, 2% risk at the 8% stop, 100-lot, adding-to-loser, plus bad news / results week / ex-dividend from `Today.newsForCheck`). Advisory only: it never places or sends an order. Adapted from the `trader-risk` idea.
- `bridge/opend_bridge.py` – local read-only HTTP bridge to OpenD (token-auth, allowlisted vendor scripts, no trading endpoints); `bridge/check_setup.py` – read-only self-check for the user's computer; `docs/connect-moomoo.md` – setup guide
- `public/moomoo.js` – pure parser/merger for **Import from Moomoo** (Portfolio tab): bridge `/portfolio` answer -> tracker positions + preview. Read-only. Merge keeps the user's notes/cap size/trimmed/high-water; skips shorts, options and non-MY positions; free cash = cash - frozen (only offered if MYR); unknown stocks keep a cleaned name as ticker plus their code (`TICKER@CODE` for `/api/quotes`). Tickers must match `/^[A-Z0-9.&-]{1,20}$/` everywhere (a bad one 400s a whole batch).
- **Usage** tab + `netlify/functions/analytics.js` (+ `api/analytics.js`) – Vercel Web Analytics aggregates (views, visitors, daily chart, top pages/countries/devices/referrers). Needs `VERCEL_ANALYTICS_TOKEN`; without it (or on Netlify) answers `{connected:false, reason}` and the tab shows setup copy instead of numbers. The tracking beacon (`/_vercel/insights/script.js`) is in `index.html`; it only resolves and reports on the Vercel deployment.
- `.claude/skills/` – official Moomoo skills v2.1 (news-search, stock-digest, comment-sentiment, capital/derivatives/technical-anomaly), plus `moomooapi` and `install-moomoo-opend` (vendor files; re-download from https://www.moomoo.com/skills/moomoo-install.md to update)

- `.claude/skills/trader-*` – 15 third-party skills (MIT, pinned + reviewed): 11 from `day-trader-skill` v2 (scanner, entry, exit, timemachine, alerts, analyst, broker, budget, news, pelosi, risk) plus 4 kept from `trader-skill` v1 (copycat, rebalance, screener, tax). See `docs/third-party/*/PROVENANCE.md`. **US-market only** (Nasdaq/NYSE, SEC, Congress PTRs, Alpaca/IBKR). Do NOT use them for Bursa stocks: use the `moomoo-*` skills and this app. v2 risk blocks buys without a stop unless `require_stop` is false and blocks entries outside US hours. Their broker skill needs 3 approval gates; never set an order tool to "Always allow".

## Commands
- `npm test` – JS + bridge unit tests; `npm run dev` – `netlify dev`; `npm run deploy`
- Env: see `.env.example` (`GEMINI_API_KEY` required for analysis)

## Deploy (Vercel)
- `vercel.json` serves `public/`; `api/*.js` wrap the same handlers in `netlify/functions/` via `api/_adapt.js` (Netlify still works).
- Env vars (Production + Preview): `GEMINI_API_KEY`, optional `GEMINI_MODEL` (blank = auto-discovered newest stable flash; set it to force e.g. a pro model), `ACCESS_TOKEN`. Don't set OPEND/BRIDGE vars; the bridge is local-only.
- Usage tab: enable Web Analytics on the Vercel project (Analytics tab → Enable), then set `VERCEL_ANALYTICS_TOKEN` (Production + Preview) and redeploy. See `.env.example` for the optional overrides.
- `/api/analyze` spends your Gemini quota: set `ACCESS_TOKEN` (UI field remembers it in localStorage) and/or Vercel Deployment Protection.
- `.vercelignore` keeps skills, bridge, docs and tests out of the deploy.
- `package.json` pins `engines.node` to `24.x` and has NO dependencies on purpose: `">=18"` let Vercel auto-upgrade to Node 26, and the `netlify-cli` devDependency then failed `npm install` (a transitive package needs `SlowBuffer`), which broke deploys. `netlify` commands run via `npx --package netlify-cli`. Don't add heavy devDependencies or loosen `engines`.

## Prices
- The page refreshes held positions' prices from `/api/quotes` on load/refresh (`Tracker.applyQuotes`): a quote replaces a stored price only if it is NEWER than that price's `priceAt`, so a price typed more recently is never overwritten. Unknown tickers (not in `stocks.js`) get no quote and Today flags them stale.
- Yahoo is unofficial and may rate-limit cloud IPs: every caller must degrade gracefully (analysis falls back to "price UNKNOWN, do not guess"; pre-trade check shows "history unavailable").
- Pre-trade check adds: typo guard (>3% from the quote), stop vs daily swing (warn <1.5x ATR), 52-week position, and the reality check (warn only if stop-first >= 2x target-first with >= 60 starts).

## Today page rules
- Opportunities = watchlist names (not held) with positive recency-weighted headline momentum and no bad news in 7 days. It is a news signal only: no price/valuation data. Threshold is `MIN_OPP_SCORE` in `today.js`.
- Stops are checked against the last price on file (typed, Yahoo delayed quote, or imported from Moomoo); positions carry `priceAt`/`priceSrc` and Today flags prices older than the last close.
- Relevance filter matters: Moomoo keyword search returns other companies' news (e.g. "Maybank" as a broker); extend `EXCLUDE`/`BROKERS`/`KEYWORD` in `lib/signals.js` when a ticker returns junk.
- Matching rules in `lib/signals.js`: whole words only; names of 3 letters or fewer, and dictionary-like names in `AMBIGUOUS` (inari, dialog, harta, misc, sime), count only when written exactly in UPPERCASE (so "ATM" is not TM, "Toyokawa Inari" is not INARI). Add look-alike companies to `EXCLUDE` (Genting vs Genting Malaysia/Singapore, IOI Corp vs IOI Properties). Validated on 743 live headlines for 44 stocks: 7 dropped, all junk.
- `/api/brief` request URLs contain watchlist and position tickers (no quantities or prices).

## Notes
- News needs no OpenD. Quotes/portfolio need OpenD running locally + the bridge (`BRIDGE_TOKEN=… python3 bridge/opend_bridge.py`). Bridge defaults to SIMULATE; REAL needs `BRIDGE_ALLOW_REAL=1`. Never expose it publicly.
- Run `/install-moomoo-opend` on your own machine (needs GUI login); not in cloud sessions.
- Ticker codes in `stocks.js` should be verified against Bursa before use.
- Trading rules: max 3 positions, trailing stop on entry day, no unplanned -10% holds.
- Output is educational research, not financial advice. Never commit API keys or account data.
