---
name: moomoo-news-search
description: Search Moomoo news, notices and research reports for a stock or keyword. Use for 'latest news on X'.
---

# moomoo-news-search

Uses the Moomoo OpenAPI Python SDK (`pip install moomoo-api`, `import moomoo as ft`) against a locally
running OpenD (`OPEND_HOST`/`OPEND_PORT`, default 127.0.0.1:11111). Bursa Malaysia codes use the `MY.` prefix
(e.g. `MY.5398` for GAMUDA). Check the installed SDK's docs for exact method names and your market
data entitlements before relying on a call.

## Steps
1. Resolve the stock name to a Bursa code.
2. Query Moomoo news search through OpenD.
3. Return headline, source, time, and link; group by news / notice / research.

## Output
Short, sourced summary. Say plainly when OpenD is not running or data is not entitled. Educational only; not financial advice.
