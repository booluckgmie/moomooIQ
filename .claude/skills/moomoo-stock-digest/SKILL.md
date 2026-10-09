---
name: moomoo-stock-digest
description: One-page digest for a Bursa stock combining quote, news, sentiment and signals. Use for 'digest X'.
---

# moomoo-stock-digest

Uses the Moomoo OpenAPI Python SDK (`pip install moomoo-api`, `import moomoo as ft`) against a locally
running OpenD (`OPEND_HOST`/`OPEND_PORT`, default 127.0.0.1:11111). Bursa Malaysia codes use the `MY.` prefix
(e.g. `MY.5398` for GAMUDA). Check the installed SDK's docs for exact method names and your market
data entitlements before relying on a call.

## Steps
1. Pull snapshot quote (price, change, volume, P/E if available).
2. Run news-search, comment-sentiment, and technical-anomaly for the same code.
3. Summarise in 5 bullets plus a watch/avoid/hold leaning with stop level.

## Output
Short, sourced summary. Say plainly when OpenD is not running or data is not entitled. Educational only; not financial advice.
