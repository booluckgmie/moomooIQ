#!/usr/bin/env python3
"""Is this computer ready to connect MoomooIQ to your Moomoo account?

Read-only: it imports the Moomoo package, tries OpenD's local port and looks at two environment variables.
It never logs in, never asks for credentials and never places anything.

    python3 bridge/check_setup.py
"""
import importlib
import os
import socket
import sys

OK, WARN, FAIL = "ok", "warn", "fail"


def check_python(version=None):
    v = version or sys.version_info[:3]
    if tuple(v) >= (3, 8):
        return OK, "Python %d.%d.%d" % tuple(v)
    return FAIL, "Python %d.%d is too old. Install Python 3.8 or newer." % tuple(v[:2])


def check_sdk(importer=importlib.import_module):
    try:
        m = importer("moomoo")
    except ImportError:
        return FAIL, "The Moomoo package is missing. Run: pip install moomoo-api"
    return OK, "moomoo-api %s" % getattr(m, "__version__", "(version unknown)")


def check_opend(host, port, connect=socket.create_connection):
    try:
        with connect((host, port), timeout=2):
            pass
    except OSError:
        return FAIL, ("Nothing is listening on %s:%d. Start Moomoo OpenD and log in with your Moomoo account "
                      "(in the OpenD window, not here). The install-moomoo-opend skill can download it." % (host, port))
    return OK, "OpenD is answering on %s:%d (this only proves the port is open; make sure OpenD shows you as logged in)" % (host, port)


def check_token(env):
    t = env.get("BRIDGE_TOKEN", "")
    if not t:
        return FAIL, "BRIDGE_TOKEN is not set. Pick any long random string, e.g.: export BRIDGE_TOKEN=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
    if len(t) < 16:
        return WARN, "BRIDGE_TOKEN is short (%d characters). Use at least 16 random characters." % len(t)
    return OK, "BRIDGE_TOKEN is set (%d characters)" % len(t)


def check_origin(env):
    o = env.get("BRIDGE_ALLOW_ORIGIN", "")
    if not o:
        return WARN, ("BRIDGE_ALLOW_ORIGIN is not set. The deployed website will be blocked by your browser; "
                      "set it to the site's address, e.g. export BRIDGE_ALLOW_ORIGIN=https://moomooiq.vercel.app")
    if o.endswith("/") or not o.startswith(("http://", "https://")):
        return FAIL, "BRIDGE_ALLOW_ORIGIN must look like https://moomooiq.vercel.app (no trailing slash): got %r" % o
    return OK, "Website allowed to talk to the bridge: %s" % o


def check_real(env):
    if env.get("BRIDGE_ALLOW_REAL") == "1":
        return OK, "Real-account reads are ON (read-only). Importing your real positions will work."
    return WARN, "Real-account reads are off, so only the paper account can be read. To import your real positions: export BRIDGE_ALLOW_REAL=1 (still read-only)."


def run(env=None):
    env = os.environ if env is None else env
    host = env.get("MOOMOO_OPEND_HOST", "127.0.0.1")
    try:
        port = int(env.get("MOOMOO_OPEND_PORT", "11111"))
    except ValueError:
        port = 11111
    return [("Python", check_python()), ("Moomoo package", check_sdk()), ("OpenD", check_opend(host, port)),
            ("Bridge token", check_token(env)), ("Website origin", check_origin(env)), ("Real account", check_real(env))]


def main():
    mark = {OK: "[ok]  ", WARN: "[warn]", FAIL: "[FAIL]"}
    results = run()
    for name, (status, msg) in results:
        print("%s %-15s %s" % (mark[status], name, msg))
    bad = [n for n, (s, _) in results if s == FAIL]
    print()
    if bad:
        print("Fix the [FAIL] items above, then run this again.")
        return 1
    print("Ready. Start the bridge:  python3 bridge/opend_bridge.py   then use Portfolio > Import from Moomoo.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
