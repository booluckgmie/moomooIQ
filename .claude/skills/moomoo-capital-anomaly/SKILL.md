---
name: moomoo-capital-anomaly
description: Detect unusual capital flow for a stock (large in/outflow vs recent average). Use for 'capital flow anomalies'.
---

# moomoo-capital-anomaly

Uses the Moomoo OpenAPI Python SDK (`pip install moomoo-api`, `import moomoo as ft`) against a locally
running OpenD (`OPEND_HOST`/`OPEND_PORT`, default 127.0.0.1:11111). Bursa Malaysia codes use the `MY.` prefix
(e.g. `MY.5398` for GAMUDA). Check the installed SDK's docs for exact method names and your market
data entitlements before relying on a call.

## Steps
1. Fetch capital flow / distribution data.
2. Compare today's net flow to the trailing average.
3. Report anomalies with magnitude and whether they match price action.

## Output
Short, sourced summary. Say plainly when OpenD is not running or data is not entitled. Educational only; not financial advice.
