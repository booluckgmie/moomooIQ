---
name: moomoo-derivatives-anomaly
description: Detect unusual derivatives activity (warrants/options/futures) linked to a stock. Use when asked about derivatives signals.
---

# moomoo-derivatives-anomaly

Uses the Moomoo OpenAPI Python SDK (`pip install moomoo-api`, `import moomoo as ft`) against a locally
running OpenD (`OPEND_HOST`/`OPEND_PORT`, default 127.0.0.1:11111). Bursa Malaysia codes use the `MY.` prefix
(e.g. `MY.5398` for GAMUDA). Check the installed SDK's docs for exact method names and your market
data entitlements before relying on a call.

## Steps
1. Fetch related derivatives data where the market supports it.
2. Flag volume or open-interest spikes versus recent norms.
3. State clearly if Bursa has no coverage for this symbol.

## Output
Short, sourced summary. Say plainly when OpenD is not running or data is not entitled. Educational only; not financial advice.
