# MoomooIQ
Gemini-powered Bursa Malaysia analysis + Moomoo OpenAPI skills for Claude Code. See `CLAUDE.md` and `.env.example`.

Deploy: `netlify init && netlify env:set GEMINI_API_KEY <key> && netlify deploy --prod`.
Educational only; not financial advice.

## Deploy to Vercel
1. Import the GitHub repo in Vercel (framework: Other; no build/install needed - `vercel.json` handles it).
2. Add env vars `GEMINI_API_KEY` and `ACCESS_TOKEN` (any long random string) for Production and Preview.
3. Deploy, then enter the access token in the Analyse tab. Portfolio data stays in your browser.
