# trader-skill (third-party)

- Source: https://github.com/Jakeschincariol/trader-skill (MIT, see LICENSE next to this file)
- Pinned commit: 5189e79b9a480755a3733ac9713f5353981dbe18 ("The Trader skill: 11 Claude skills, v1.0")
- Installed: 2026-10-22, project-local in `.claude/skills/trader-*` (tests and README not copied)
- Reviewed before install: standard-library Python only; network limited to public data hosts (SEC EDGAR, House Clerk,
  Yahoo Finance, Stooq, OpenFIGI, NYSE calendar); one subprocess call (`pdftotext` on a downloaded PDF); no eval/exec/pickle/
  base64/sockets; env vars read: SEC_USER_AGENT, OPENFIGI_API_KEY. Skill text adds approval gates; none bypass them.
- Scope: US markets (SEC filings, Congress PTRs, NYSE calendar, US tax rules, Alpaca/IBKR). NOT for Bursa Malaysia stocks;
  use the `moomoo-*` skills and the web app for those. Ideas adapted for Bursa live in `public/tracker.js` (pre-trade check).
- To update: re-clone, diff against the pinned commit, re-review, then replace the folders and bump the commit here.

## Superseded in part (2026-11-05)
`day-trader-skill` (v2) was installed afterwards and replaced 7 of these folders (alerts, analyst, broker, budget, news,
pelosi, risk). Only **trader-copycat, trader-rebalance, trader-screener, trader-tax** are still the v1 copies from this
commit. See `../day-trader-skill/PROVENANCE.md` for the full table and how the two interact.
