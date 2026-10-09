# MoomooIQ

Bursa Malaysia stock analysis SPA (Gemini) plus Claude Code skills for Moomoo OpenAPI.

## Layout
- `public/index.html` – SPA, 3 tabs (Analyse, News, Portfolio)
- `netlify/functions/` – `analyze.js` (Gemini, 3 frameworks), `stocks.js` (universe), `moomoo-news.js` (bridge proxy)
- `.claude/skills/moomoo-*` – six OpenD skills (news, digest, sentiment, capital, derivatives, technical)

## Commands
- `npm test` – unit tests; `npm run dev` – `netlify dev`; `npm run deploy`
- Env: see `.env.example` (`GEMINI_API_KEY` required for analysis)

## Notes
- OpenD is local TCP; deployed functions can't reach it without `OPEND_BRIDGE_URL`.
- Ticker codes in `stocks.js` should be verified against Bursa before use.
- Trading rules: max 3 positions, trailing stop on entry day, no unplanned -10% holds.
- Output is educational research, not financial advice. Never commit API keys or account data.
