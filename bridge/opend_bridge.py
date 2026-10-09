#!/usr/bin/env python3
"""Local read-only HTTP bridge to Moomoo OpenD.

Runs next to OpenD and shells out to the vendor scripts in .claude/skills/moomooapi/scripts
(allowlisted, read-only, `--json`). There is deliberately no order/trade endpoint.

  BRIDGE_TOKEN=<secret> python3 bridge/opend_bridge.py          # required
  BRIDGE_PORT=8787  BRIDGE_ALLOW_ORIGIN=https://your-site.netlify.app
  BRIDGE_ALLOW_REAL=1   # allow trd_env=REAL on /portfolio (default: SIMULATE only)
  BRIDGE_HOST=127.0.0.1 # keep loopback unless you front it with your own authenticated tunnel
"""
import hmac
import json
import os
import re
import socket
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCRIPTS = Path(__file__).resolve().parent.parent / ".claude/skills/moomooapi/scripts"
CODE_RE = re.compile(r"^[A-Z]{2,3}\.[A-Z0-9]{1,12}$")  # e.g. MY.5398, US.AAPL, HK.00700
KTYPES = {"1m", "5m", "15m", "30m", "60m", "1d", "1w", "1M"}
MARKETS = {"MY", "US", "HK", "SG", "CN", "JP", "AU", "CA"}
ENVS = {"SIMULATE", "REAL"}


class BadRequest(ValueError):
    pass


def _one(q, key, default=None):
    v = q.get(key, [default])[0]
    return v


def _code(q):
    code = _one(q, "code", "")
    if not CODE_RE.match(code or ""):
        raise BadRequest("code must look like MY.5398 or US.AAPL")
    return code


def build_command(path, q, allow_real=False):
    """Map an allowlisted endpoint + query to (script, args). Raises BadRequest otherwise."""
    if path == "/snapshot":
        return "quote/get_snapshot.py", [_code(q), "--json"]
    if path == "/capital-flow":
        return "quote/get_capital_flow.py", [_code(q), "--json"]
    if path == "/kline":
        ktype = _one(q, "ktype", "1d")
        if ktype not in KTYPES:
            raise BadRequest(f"ktype must be one of {sorted(KTYPES)}")
        num = _one(q, "num", "30")
        if not num.isdigit() or not 1 <= int(num) <= 500:
            raise BadRequest("num must be 1-500")
        return "quote/get_kline.py", [_code(q), "--ktype", ktype, "--num", num, "--json"]
    if path == "/portfolio":
        market = _one(q, "market", "MY")
        env = _one(q, "trd_env", "SIMULATE")
        if market not in MARKETS:
            raise BadRequest(f"market must be one of {sorted(MARKETS)}")
        if env not in ENVS:
            raise BadRequest("trd_env must be SIMULATE or REAL")
        if env == "REAL" and not allow_real:
            raise BadRequest("REAL disabled; start the bridge with BRIDGE_ALLOW_REAL=1")
        return "trade/get_portfolio.py", ["--market", market, "--trd-env", env, "--json"]
    raise BadRequest("unknown endpoint")


def run_script(script, args, timeout=30):
    proc = subprocess.run(
        [sys.executable, "-I", str(SCRIPTS / script), *args],
        cwd=str(SCRIPTS), capture_output=True, text=True, timeout=timeout,
    )
    out = proc.stdout.strip()
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        data = {"output": out}
    if proc.returncode != 0:
        return 502, {"error": "script failed", "detail": data if out else proc.stderr.strip()[-500:]}
    return 200, data


def opend_reachable(host, port):
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = "MoomooIQBridge/0.1"

    def _send(self, status, body):
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(raw)))
        origin = os.environ.get("BRIDGE_ALLOW_ORIGIN")
        if origin and self.headers.get("Origin") == origin:
            self.send_header("access-control-allow-origin", origin)
            self.send_header("access-control-allow-headers", "authorization")
            self.send_header("access-control-allow-private-network", "true")
            self.send_header("vary", "Origin")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        token = os.environ["BRIDGE_TOKEN"]
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(supplied, token):
            return self._send(401, {"error": "unauthorized"})
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/health":
            host = os.environ.get("MOOMOO_OPEND_HOST", "127.0.0.1")
            port = int(os.environ.get("MOOMOO_OPEND_PORT", "11111"))
            return self._send(200, {"bridge": "ok", "opend": opend_reachable(host, port)})
        try:
            script, args = build_command(url.path, q, os.environ.get("BRIDGE_ALLOW_REAL") == "1")
            status, body = run_script(script, args)
        except BadRequest as e:
            return self._send(400, {"error": str(e)})
        except subprocess.TimeoutExpired:
            return self._send(504, {"error": "OpenD call timed out"})
        self._send(status, body)

    def log_message(self, fmt, *a):  # keep tokens/queries out of logs
        sys.stderr.write("bridge: %s\n" % (fmt % a).split("?")[0])


def main():
    if not os.environ.get("BRIDGE_TOKEN"):
        sys.exit("BRIDGE_TOKEN is required (any long random string).")
    host = os.environ.get("BRIDGE_HOST", "127.0.0.1")
    port = int(os.environ.get("BRIDGE_PORT", "8787"))
    print(f"MoomooIQ bridge on http://{host}:{port} (read-only)")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
