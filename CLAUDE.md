# MoomooIQ

Bursa Malaysia stock analysis SPA (Gemini) plus Claude Code skills for Moomoo OpenAPI.

## Layout
- `public/index.html` – SPA; **Today** is the default tab (Needs action / Best opportunities / Heads-up / Your positions), then Analyse, News, Portfolio
- `public/today.js` – pure Today logic: market hours (MYT), next-check time, price freshness, tier building, ranking
- `lib/signals.js` – headline relevance filter + keyword tone/tags (server side); `netlify/functions/brief.js` (+ `api/brief.js`) batches Moomoo news/notices for a ticker list
- `netlify/functions/` – `analyze.js` (Gemini; ONE section per request, the page fires 3 in parallel; retries transient errors, falls back across auto-discovered models, grounds the prompt with today's date + verified Moomoo headlines + the user's price, forbids invented prices), `lib/newsfeed.js` (shared Moomoo fetch + 5-min cache), `public/md.js` (safe markdown renderer for model output), `stocks.js` (universe), `moomoo-news.js` (public Moomoo news API)
- `public/tracker.js` – pure portfolio rules engine (stops, ladder, trim, alerts, position sizing [2% risk default, 100-share lots, 1/3 slot cap, RM200 cash buffer], export/import JSON v1 with validation); tests in `tests/`. Positions live in the browser's localStorage only.
- `bridge/opend_bridge.py` – local read-only HTTP bridge to OpenD (token-auth, allowlisted vendor scripts, no trading endpoints)
- `.claude/skills/` – official Moomoo skills v2.1 (news-search, stock-digest, comment-sentiment, capital/derivatives/technical-anomaly), plus `moomooapi` and `install-moomoo-opend` (vendor files; re-download from https://www.moomoo.com/skills/moomoo-install.md to update)

## Commands
- `npm test` – JS + bridge unit tests; `npm run dev` – `netlify dev`; `npm run deploy`
- Env: see `.env.example` (`GEMINI_API_KEY` required for analysis)

## Deploy (Vercel)
- `vercel.json` serves `public/`; `api/*.js` wrap the same handlers in `netlify/functions/` via `api/_adapt.js` (Netlify still works).
- Env vars (Production + Preview): `GEMINI_API_KEY`, optional `GEMINI_MODEL` (blank = auto-discovered newest stable flash; set it to force e.g. a pro model), `ACCESS_TOKEN`. Don't set OPEND/BRIDGE vars; the bridge is local-only.
- `/api/analyze` spends your Gemini quota: set `ACCESS_TOKEN` (UI field remembers it in localStorage) and/or Vercel Deployment Protection.
- `.vercelignore` keeps skills, bridge, docs and tests out of the deploy.

## Today page rules
- Opportunities = watchlist names (not held) with positive recency-weighted headline momentum and no bad news in 7 days. It is a news signal only: no price/valuation data. Threshold is `MIN_OPP_SCORE` in `today.js`.
- Stops are only checked against prices the user entered; positions carry `priceAt` and Today flags prices older than the last close.
- Relevance filter matters: Moomoo keyword search returns other companies' news (e.g. "Maybank" as a broker); extend `EXCLUDE`/`BROKERS`/`KEYWORD` in `lib/signals.js` when a ticker returns junk.
- `/api/brief` request URLs contain watchlist and position tickers (no quantities or prices).

## Notes
- News needs no OpenD. Quotes/portfolio need OpenD running locally + the bridge (`BRIDGE_TOKEN=… python3 bridge/opend_bridge.py`). Bridge defaults to SIMULATE; REAL needs `BRIDGE_ALLOW_REAL=1`. Never expose it publicly.
- Run `/install-moomoo-opend` on your own machine (needs GUI login); not in cloud sessions.
- Ticker codes in `stocks.js` should be verified against Bursa before use.
- Trading rules: max 3 positions, trailing stop on entry day, no unplanned -10% holds.
- Output is educational research, not financial advice. Never commit API keys or account data.
