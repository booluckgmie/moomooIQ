---
name: moomoo-technical-anomaly
description: Detect technical signals (breakouts, volume spikes, MA crosses, RSI extremes) for a stock. Use for 'technical signals for X'.
---

# moomoo-technical-anomaly

Uses the Moomoo OpenAPI Python SDK (`pip install moomoo-api`, `import moomoo as ft`) against a locally
running OpenD (`OPEND_HOST`/`OPEND_PORT`, default 127.0.0.1:11111). Bursa Malaysia codes use the `MY.` prefix
(e.g. `MY.5398` for GAMUDA). Check the installed SDK's docs for exact method names and your market
data entitlements before relying on a call.

## Steps
1. Fetch recent K-line data.
2. Compute MA20/50, RSI14, volume vs 20-day average.
3. Report signals and a stop-loss reference (cost x 0.92 for an 8% stop).

## Output
Short, sourced summary. Say plainly when OpenD is not running or data is not entitled. Educational only; not financial advice.
