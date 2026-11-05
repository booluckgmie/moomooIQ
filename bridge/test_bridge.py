import unittest
import opend_bridge as b


class BuildCommand(unittest.TestCase):
    def test_snapshot(self):
        self.assertEqual(b.build_command("/snapshot", {"code": ["MY.5398"]}),
                         ("quote/get_snapshot.py", ["MY.5398", "--json"]))

    def test_rejects_bad_code_and_injection(self):
        for bad in ["", "5398", "MY.5398 --x", "../etc", "my.5398", "MY.5398;ls"]:
            with self.assertRaises(b.BadRequest):
                b.build_command("/snapshot", {"code": [bad]})

    def test_kline_bounds(self):
        with self.assertRaises(b.BadRequest):
            b.build_command("/kline", {"code": ["MY.5398"], "num": ["9999"]})
        with self.assertRaises(b.BadRequest):
            b.build_command("/kline", {"code": ["MY.5398"], "ktype": ["1y; rm"]})

    def test_portfolio_defaults_to_simulate_and_blocks_real(self):
        _, args = b.build_command("/portfolio", {})
        self.assertIn("SIMULATE", args)
        with self.assertRaises(b.BadRequest):
            b.build_command("/portfolio", {"trd_env": ["REAL"]})
        _, args = b.build_command("/portfolio", {"trd_env": ["REAL"]}, allow_real=True)
        self.assertIn("REAL", args)

    def test_no_trading_endpoints(self):
        for p in ["/place_order", "/order", "/trade", "/cancel"]:
            with self.assertRaises(b.BadRequest):
                b.build_command(p, {"code": ["MY.5398"]})


if __name__ == "__main__":
    unittest.main()


# ---- the real HTTP server, as a browser would talk to it (OpenD scripts replaced by a stub) ----
import http.client
import json
import os
import threading
from http.server import ThreadingHTTPServer


class LiveServer(unittest.TestCase):
    ORIGIN = "https://moomooiq.vercel.app"

    @classmethod
    def setUpClass(cls):
        cls.calls = []
        cls._orig = b.run_script
        b.run_script = lambda script, args, timeout=30: (cls.calls.append((script, args)) or (200, {"funds": {"cash": 1}, "positions": []}))
        os.environ["BRIDGE_TOKEN"] = "t0k-t0k-t0k-t0k-t0k"
        os.environ["BRIDGE_ALLOW_ORIGIN"] = cls.ORIGIN
        os.environ.pop("BRIDGE_ALLOW_REAL", None)
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), b.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        b.run_script = cls._orig
        for k in ("BRIDGE_TOKEN", "BRIDGE_ALLOW_ORIGIN", "BRIDGE_ALLOW_REAL"):
            os.environ.pop(k, None)

    def req(self, method, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request(method, path, headers=headers or {})
        r = c.getresponse()
        body = r.read()
        out = (r.status, {k.lower(): v for k, v in r.getheaders()}, body)
        c.close()
        return out

    def test_preflight_is_a_valid_204_with_cors_for_the_allowed_origin_only(self):
        status, h, body = self.req("OPTIONS", "/portfolio", {"Origin": self.ORIGIN, "Access-Control-Request-Headers": "authorization"})
        self.assertEqual((status, body), (204, b""))                       # no body on a 204
        self.assertEqual(h.get("content-length"), "0")                     # and it must say so (the old code claimed 2 bytes)
        self.assertEqual(h.get("access-control-allow-origin"), self.ORIGIN)
        self.assertEqual(h.get("access-control-allow-private-network"), "true")
        self.assertIn("authorization", h.get("access-control-allow-headers", ""))
        status, h, body = self.req("OPTIONS", "/portfolio", {"Origin": "https://evil.example"})
        self.assertEqual((status, body), (204, b""))
        self.assertNotIn("access-control-allow-origin", h)                 # other sites get no permission

    def test_portfolio_needs_the_token_and_returns_stubbed_json_with_cors(self):
        n = len(self.calls)
        status, _, _ = self.req("GET", "/portfolio?market=MY&trd_env=SIMULATE", {"Origin": self.ORIGIN})
        self.assertEqual(status, 401)
        status, _, _ = self.req("GET", "/portfolio?market=MY&trd_env=SIMULATE", {"Authorization": "Bearer wrong"})
        self.assertEqual(status, 401)
        self.assertEqual(len(self.calls), n)                               # nothing ran without the token
        status, h, body = self.req("GET", "/portfolio?market=MY&trd_env=SIMULATE", {"Authorization": "Bearer t0k-t0k-t0k-t0k-t0k", "Origin": self.ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["funds"]["cash"], 1)
        self.assertEqual(h.get("access-control-allow-origin"), self.ORIGIN)
        self.assertEqual(self.calls[-1], ("trade/get_portfolio.py", ["--market", "MY", "--trd-env", "SIMULATE", "--json"]))

    def test_real_account_reads_stay_off_until_the_bridge_is_started_with_the_flag(self):
        auth = {"Authorization": "Bearer t0k-t0k-t0k-t0k-t0k"}
        n = len(self.calls)
        status, _, body = self.req("GET", "/portfolio?market=MY&trd_env=REAL", auth)
        self.assertEqual(status, 400)
        self.assertIn("BRIDGE_ALLOW_REAL=1", json.loads(body)["error"])
        self.assertEqual(len(self.calls), n)
        os.environ["BRIDGE_ALLOW_REAL"] = "1"
        try:
            status, _, _ = self.req("GET", "/portfolio?market=MY&trd_env=REAL", auth)
            self.assertEqual(status, 200)
            self.assertEqual(self.calls[-1][1][3], "REAL")
        finally:
            os.environ.pop("BRIDGE_ALLOW_REAL", None)

    def test_there_is_still_no_way_to_trade(self):
        auth = {"Authorization": "Bearer t0k-t0k-t0k-t0k-t0k"}
        for path in ("/place_order", "/order", "/trade", "/cancel", "/orders", "/unlock"):
            self.assertEqual(self.req("GET", path, auth)[0], 400)


# ---- the setup self-check ----
import check_setup as cs


class SetupCheck(unittest.TestCase):
    def test_python_version(self):
        self.assertEqual(cs.check_python((3, 8, 0))[0], cs.OK)
        self.assertEqual(cs.check_python((3, 7, 9))[0], cs.FAIL)

    def test_sdk_missing_names_the_fix_and_present_reports_version(self):
        def missing(_): raise ImportError()
        st, msg = cs.check_sdk(missing)
        self.assertEqual(st, cs.FAIL); self.assertIn("pip install moomoo-api", msg)
        class Fake: __version__ = "9.9.9"
        self.assertEqual(cs.check_sdk(lambda _: Fake), (cs.OK, "moomoo-api 9.9.9"))

    def test_opend_down_and_up(self):
        def refuse(*a, **k): raise ConnectionRefusedError()
        st, msg = cs.check_opend("127.0.0.1", 11111, refuse)
        self.assertEqual(st, cs.FAIL); self.assertIn("log in", msg)
        class Ctx:
            def __enter__(self): return self
            def __exit__(self, *a): return False
        self.assertEqual(cs.check_opend("127.0.0.1", 11111, lambda *a, **k: Ctx())[0], cs.OK)

    def test_token_origin_and_real_flags(self):
        self.assertEqual(cs.check_token({})[0], cs.FAIL)
        self.assertEqual(cs.check_token({"BRIDGE_TOKEN": "short"})[0], cs.WARN)
        self.assertEqual(cs.check_token({"BRIDGE_TOKEN": "x" * 24})[0], cs.OK)
        self.assertEqual(cs.check_origin({})[0], cs.WARN)
        self.assertEqual(cs.check_origin({"BRIDGE_ALLOW_ORIGIN": "https://moomooiq.vercel.app/"})[0], cs.FAIL)
        self.assertEqual(cs.check_origin({"BRIDGE_ALLOW_ORIGIN": "moomooiq.vercel.app"})[0], cs.FAIL)
        self.assertEqual(cs.check_origin({"BRIDGE_ALLOW_ORIGIN": "https://moomooiq.vercel.app"})[0], cs.OK)
        self.assertEqual(cs.check_real({})[0], cs.WARN)
        self.assertEqual(cs.check_real({"BRIDGE_ALLOW_REAL": "1"})[0], cs.OK)

    def test_run_never_prints_secrets(self):
        env = {"BRIDGE_TOKEN": "SUPERSECRETTOKEN123456", "MOOMOO_OPEND_PORT": "1"}
        text = repr(cs.run(env))
        self.assertNotIn("SUPERSECRETTOKEN123456", text)
