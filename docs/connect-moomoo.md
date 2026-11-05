# Connect MoomooIQ to your Moomoo account (read-only)

The website never sees your Moomoo login. Moomoo's own program, **OpenD**, runs on *your* computer and holds the
login. A small read-only helper (`bridge/opend_bridge.py`) sits next to it, and your browser talks to that helper.

```
Moomoo account  <->  OpenD (your computer)  <->  bridge (your computer, read-only)  <->  MoomooIQ page in your browser
```

Nothing here can place an order. Real orders: place them yourself in the Moomoo app.

## One-time setup (about 10 minutes)

1. **Install OpenD** from Moomoo's OpenAPI download page for your system (or run the `install-moomoo-opend` skill from
   Claude Code on that computer). Start it and **log in with your Moomoo account in the OpenD window**. It listens on
   port 11111. Check its window shows you as logged in.
2. **Install Python 3.8+** if you do not have it, then the Moomoo package: `pip install moomoo-api`.
3. **Get this repo** on that computer: `git clone https://github.com/booluckgmie/moomooIQ` (use the branch you deploy).
4. **Check your setup:** `python3 bridge/check_setup.py` (on Windows: `py bridge\check_setup.py`). It tells you exactly what is
   missing. It never logs in and never asks for credentials.
5. **Start the bridge**, with your own random token and your site's address:

   macOS / Linux:
   ```bash
   export BRIDGE_TOKEN=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))'); echo "$BRIDGE_TOKEN"
   export BRIDGE_ALLOW_ORIGIN=https://moomooiq.vercel.app      # your site, no trailing slash
   export BRIDGE_ALLOW_REAL=1                                  # only if you want to read your REAL account
   python3 bridge/opend_bridge.py
   ```
   Windows PowerShell: `$env:BRIDGE_TOKEN="<a long random string>"; $env:BRIDGE_ALLOW_ORIGIN="https://moomooiq.vercel.app"; $env:BRIDGE_ALLOW_REAL="1"; py bridge\opend_bridge.py`

   Leave that window open. Close it to disconnect.
6. **Use it:** open the site in **Chrome or Firefox** (Safari blocks this), go to **Portfolio**, paste the token into
   *Bridge token*, choose *Paper account* or *Real account (read-only)*, press **Import from Moomoo**.
   You get a **preview**: new positions, changes, positions that are not in Moomoo, and anything skipped. Nothing changes
   until you press **Apply**.

## What the import does
- Reads positions and cash from your **Malaysia (Bursa)** account only. Shorts, options and non-Malaysian holdings are
  skipped (the preview lists them with the reason).
- Updates **shares, average cost and price**. It keeps your own notes: loss plan, "trimmed" tick, cap size, trailing-stop
  high. New positions default to mid cap: pick small / mid / large in the preview.
- Offers to set **free cash** = cash minus money on hold (only when the account reports MYR).
- Positions that are in your tracker but not in Moomoo are **kept** unless you tick "Remove these".
- Prices from Moomoo are marked "from Moomoo" and are not overwritten by the delayed Yahoo quotes.

## If something goes wrong
| What you see | What it means / what to do |
| --- | --- |
| Cannot reach the bridge | The bridge is not running, or you are in Safari. Start step 5; use Chrome/Firefox. |
| The bridge token is wrong | Use exactly the `BRIDGE_TOKEN` the bridge was started with. |
| Real-account reads are switched off | Restart the bridge with `BRIDGE_ALLOW_REAL=1` (still read-only). |
| OpenD is not running or not reachable | Start OpenD and log in, then try again. |
| The Moomoo Python package is missing | `pip install moomoo-api` |
| Browser says it was blocked by CORS | `BRIDGE_ALLOW_ORIGIN` must equal your site's address exactly (`https://...`, no trailing `/`). |
| Cash is not offered | The account did not report MYR, or the cash already matches. |
| A stock shows an odd ticker | It is not in the built-in list, so its (cleaned) Moomoo name is used. It still gets prices by its code. |

## Safety
- Never type your Moomoo password, trade password or any API key into the website or into a chat. Login and trade unlock
  happen only in the OpenD window.
- Keep `BRIDGE_TOKEN` private and the bridge on its default `127.0.0.1` address. Do not expose it to the internet.
- The bridge has no order, cancel or unlock endpoints (tested). It reads only: quotes, history, capital flow and the
  portfolio.
- Not verified here: whether your Moomoo Malaysia account has OpenAPI access and Bursa market-data rights. OpenD shows what
  your account is allowed to read once you are logged in.
