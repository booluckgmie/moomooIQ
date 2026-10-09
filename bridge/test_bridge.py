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
