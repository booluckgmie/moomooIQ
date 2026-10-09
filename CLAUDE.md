# MoomooIQ

Bursa Malaysia stock analysis SPA (Gemini) plus Claude Code skills for Moomoo OpenAPI.

## Layout
- `public/index.html` – SPA, 3 tabs (Analyse, News, Portfolio)
- `netlify/functions/` – `analyze.js` (Gemini, 3 frameworks), `stocks.js` (universe), `moomoo-news.js` (public Moomoo news API)
- `public/tracker.js` – pure portfolio rules engine (stops, ladder, trim, alerts, position sizing [2% risk default, 100-share lots, 1/3 slot cap, RM200 cash buffer], export/import JSON v1 with validation); tests in `tests/`. Positions live in the browser's localStorage only.
- `bridge/opend_bridge.py` – local read-only HTTP bridge to OpenD (token-auth, allowlisted vendor scripts, no trading endpoints)
- `.claude/skills/` – official Moomoo skills v2.1 (news-search, stock-digest, comment-sentiment, capital/derivatives/technical-anomaly), plus `moomooapi` and `install-moomoo-opend` (vendor files; re-download from https://www.moomoo.com/skills/moomoo-install.md to update)

## Commands
- `npm test` – JS + bridge unit tests; `npm run dev` – `netlify dev`; `npm run deploy`
- Env: see `.env.example` (`GEMINI_API_KEY` required for analysis)

## Notes
- News needs no OpenD. Quotes/portfolio need OpenD running locally + the bridge (`BRIDGE_TOKEN=… python3 bridge/opend_bridge.py`). Bridge defaults to SIMULATE; REAL needs `BRIDGE_ALLOW_REAL=1`. Never expose it publicly.
- Run `/install-moomoo-opend` on your own machine (needs GUI login); not in cloud sessions.
- Ticker codes in `stocks.js` should be verified against Bursa before use.
- Trading rules: max 3 positions, trailing stop on entry day, no unplanned -10% holds.
- Output is educational research, not financial advice. Never commit API keys or account data.
