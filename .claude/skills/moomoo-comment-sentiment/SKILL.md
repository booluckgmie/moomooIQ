---
name: moomoo-comment-sentiment
description: Gauge community comment sentiment for a stock on Moomoo. Use for 'sentiment on X'.
---

# moomoo-comment-sentiment

Uses the Moomoo OpenAPI Python SDK (`pip install moomoo-api`, `import moomoo as ft`) against a locally
running OpenD (`OPEND_HOST`/`OPEND_PORT`, default 127.0.0.1:11111). Bursa Malaysia codes use the `MY.` prefix
(e.g. `MY.5398` for GAMUDA). Check the installed SDK's docs for exact method names and your market
data entitlements before relying on a call.

## Steps
1. Fetch recent community comments for the code.
2. Classify bullish / bearish / neutral and list recurring themes.
3. Flag low-volume or one-sided samples as unreliable.

## Output
Short, sourced summary. Say plainly when OpenD is not running or data is not entitled. Educational only; not financial advice.
