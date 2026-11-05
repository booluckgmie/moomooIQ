const test = require('node:test');
const assert = require('node:assert');
const { preTradeCheck } = require('../public/tracker');

const none = { bad: null, results: null, exDiv: null };
const base = { ticker: 'INARI', qty: 300, price: 2.12, positions: [], cash: 2700, news: none };
const levels = (r) => r.checks.map((c) => c.level);
const has = (r, level, re) => r.checks.some((c) => c.level === level && re.test(c.text));

test('a clean, in-rules trade passes and tells you the stop to place', () => {
  const r = preTradeCheck(base);
  assert.strictEqual(r.verdict, 'PASS');
  assert.ok(!levels(r).includes('block') && !levels(r).includes('warn'));
  assert.strictEqual(r.stop, 1.95);
  assert.ok(has(r, 'info', /stop at RM1\.95/));
});

test('a 4th position is blocked, but adding to a holding is allowed', () => {
  const held = ['A', 'B', 'C'].map((t) => ({ ticker: t, qty: 100, cost: 1, price: 1, type: 'mid' }));
  assert.ok(has(preTradeCheck({ ...base, positions: held }), 'block', /All 3 slots are used/));
  const adding = preTradeCheck({ ...base, ticker: 'A', qty: 100, price: 1, positions: held, cash: 2400 });
  assert.ok(has(adding, 'pass', /Adding to an existing position/));
});

test('cash buffer: cannot spend into the RM200 buffer', () => {
  const r = preTradeCheck({ ...base, cash: 700 });                       // cost 636, only 500 usable
  assert.strictEqual(r.verdict, 'BLOCK');
  assert.ok(has(r, 'block', /only RM500\.00 is free after the RM200/));
});

test('risk limit: too big for the 8% stop at 2% risk is blocked; 1 lot fits', () => {
  const r = preTradeCheck({ ...base, qty: 400 });                        // loses RM67.84 > RM54
  assert.ok(has(r, 'block', /Losing RM67\.84 at the 8% stop/));
  assert.strictEqual(preTradeCheck({ ...base, qty: 100 }).verdict, 'PASS');
});

test('position cap: one third of equity', () => {
  const r = preTradeCheck({ ...base, qty: 500, price: 1.9, riskPct: 0.1 });   // RM950 = 35% of RM2,700
  assert.ok(has(r, 'block', /would be 35\.2% of equity; the cap is 33\.3%/));
});

test('odd lots warn, not block', () => {
  const r = preTradeCheck({ ...base, qty: 250 });
  assert.strictEqual(r.verdict, 'WARN'); assert.ok(has(r, 'warn', /not a multiple of 100/));
});

test('news: bad news, results week and ex-dividend each warn; unavailable news is info only', () => {
  const r = preTradeCheck({ ...base, news: { bad: { title: 'Sime Darby Hit With RM150.2 Mil Tax Bill', daysAgo: 1 }, results: { daysAgo: 2 }, exDiv: { days: 1 } } });
  assert.strictEqual(r.verdict, 'WARN');
  assert.ok(has(r, 'warn', /Bad news 1d ago: "Sime Darby Hit With RM150\.2 Mil Tax Bill"/));
  assert.ok(has(r, 'warn', /Results announced 2d ago/));
  assert.ok(has(r, 'warn', /ex-dividend in 1 day:/));
  const off = preTradeCheck({ ...base, news: null });
  assert.strictEqual(off.verdict, 'PASS'); assert.ok(has(off, 'info', /News check unavailable/));
});

test('adding to a loser warns about averaging down', () => {
  const held = [{ ticker: 'INARI', qty: 200, cost: 2.5, price: 2.1, type: 'mid' }];
  const r = preTradeCheck({ ...base, qty: 100, positions: held, cash: 2000 });
  assert.ok(has(r, 'warn', /16% below your cost/));
});

test('bad input is blocked, and a BLOCK always outranks a WARN', () => {
  for (const bad of [{ qty: 0 }, { qty: 1.5 }, { qty: -100 }, { price: 0 }, { price: 'x' }])
    assert.strictEqual(preTradeCheck({ ...base, ...bad }).verdict, 'BLOCK');
  const both = preTradeCheck({ ...base, qty: 450, cash: 700 });            // odd lot (warn) + over cash/risk (block)
  assert.strictEqual(both.verdict, 'BLOCK');
});

test('it is advisory: no order-like output, only verdict and checks', () => {
  const r = preTradeCheck(base);
  assert.deepStrictEqual(Object.keys(r).sort(), ['checks', 'cost', 'equity', 'maxLoss', 'stop', 'verdict']);
});

// ---- market evidence (typo guard, noise, reality check) ----
const mkt = (over = {}) => ({ price: 2.12, summary: { atrPct: 0.03, low52: 1.6, high52: 3.1 },
  odds: { ok: true, stop: 0.08, target: 0.2, horizon: 30, starts: 200, independent: 6, targetPct: 0.25, stopPct: 0.30, neitherPct: 0.45 }, ...over });

test('market: price close to the quote passes; a typo or stale price warns', () => {
  assert.ok(has(preTradeCheck({ ...base, market: mkt() }), 'pass', /within 3% of the latest delayed quote \(RM2\.12\)/));
  const typo = preTradeCheck({ ...base, price: 2.12, market: mkt({ price: 2.29 }) });
  assert.ok(has(typo, 'warn', /7\.4% below the latest delayed quote \(RM2\.29\)\. Check for a typo/));
  assert.ok(has(preTradeCheck({ ...base, price: 2.5, market: mkt({ price: 2.29 }) }), 'warn', /9\.2% above/));
});

test('market: a stop tighter than 1.5x the daily swing warns; a roomy one passes', () => {
  const noisy = preTradeCheck({ ...base, market: mkt({ summary: { atrPct: 0.06, low52: 1, high52: 3 } }) });   // 8% / 6% = 1.3x
  assert.ok(has(noisy, 'warn', /only 1\.3x this stock's typical daily swing \(6%\)/));
  assert.ok(has(preTradeCheck({ ...base, market: mkt() }), 'pass', /2\.7x the typical daily swing \(3%\)/));
});

test('market: the reality check is shown with honest framing, and warns only when history clearly leans against it', () => {
  const ok = preTradeCheck({ ...base, market: mkt() });
  assert.ok(has(ok, 'info', /target came first 25% of the time, the stop first 30%, neither 45% \(200 overlapping starts, about 6 independent periods\)\. A guide, not a forecast/));
  assert.ok(!has(ok, 'warn', /History leans against/));
  const bad = preTradeCheck({ ...base, market: mkt({ odds: { ...mkt().odds, targetPct: 0.1, stopPct: 0.5, neitherPct: 0.4 } }) });
  assert.ok(has(bad, 'warn', /History leans against this setup: the stop came first 50% of the time against 10%/));
  const thin = preTradeCheck({ ...base, market: mkt({ odds: { ...mkt().odds, starts: 30, targetPct: 0.05, stopPct: 0.9, neitherPct: 0.05 } }) });
  assert.ok(!has(thin, 'warn', /History leans against/));         // too few starts to lean on
});

test('market: 52-week position is informational; unavailable and thin-history cases never block', () => {
  assert.ok(has(preTradeCheck({ ...base, market: mkt({ price: 2.35 }), price: 2.35 }), 'info', /Trades at 50% of its 52-week range \(RM1\.60 to RM3\.10\)/));
  const down = preTradeCheck({ ...base, market: null });
  assert.strictEqual(down.verdict, 'PASS'); assert.ok(has(down, 'info', /Price history unavailable/));
  assert.ok(has(preTradeCheck({ ...base, market: mkt({ odds: { ok: false } }) }), 'info', /Not enough price history/));
  assert.ok(!preTradeCheck({ ...base }).checks.some((c) => /quote|52-week|Reality/.test(c.text)));          // market undefined = not asked
});

// ---- applyQuotes ----
const { applyQuotes } = require('../public/tracker');
const NOWMS = Date.parse('2026-11-05T11:00:00+08:00');
const pos = (o = {}) => ({ ticker: 'INARI', qty: 200, cost: 2.12, type: 'mid', high: 2.41, price: 2.3, priceAt: '2026-11-04T17:05:00+08:00', ...o });

test('applyQuotes: a newer quote replaces the stored price and lifts the high-water mark', () => {
  const r = applyQuotes([pos()], { INARI: { price: 2.5, time: '2026-11-05T10:45:00+08:00' } }, NOWMS);
  assert.strictEqual(r.changed, 1);
  assert.deepStrictEqual([r.positions[0].price, r.positions[0].high, r.positions[0].priceSrc, r.positions[0].priceAt], [2.5, 2.5, 'yahoo', '2026-11-05T02:45:00.000Z']);
});

test("applyQuotes: never overwrites a price the user typed more recently than the quote's own timestamp", () => {
  const typed = pos({ price: 2.4, priceAt: '2026-11-05T10:50:00+08:00' });
  const r = applyQuotes([typed], { INARI: { price: 2.3, time: '2026-11-05T10:45:00+08:00' } }, NOWMS);
  assert.strictEqual(r.changed, 0); assert.strictEqual(r.positions[0].price, 2.4);
});

test('applyQuotes: ignores junk, future-dated and missing quotes; a position with no price takes the quote', () => {
  const q = (o) => ({ INARI: { price: 2.5, time: '2026-11-05T10:45:00+08:00', ...o } });
  for (const bad of [q({ price: 0 }), q({ price: 'x' }), q({ time: 'nope' }), q({ time: '2026-11-05T12:00:00+08:00' }), {}, null])
    assert.strictEqual(applyQuotes([pos()], bad, NOWMS).changed, 0);
  assert.strictEqual(applyQuotes([pos({ price: null, priceAt: null })], q({}), NOWMS).changed, 1);
});

test('applyQuotes: high never drops below cost or the old high; other tickers untouched; input not mutated', () => {
  const a = pos(), b = pos({ ticker: 'GAMUDA' });
  const r = applyQuotes([a, b], { INARI: { price: 2.0, time: '2026-11-05T10:45:00+08:00' } }, NOWMS);
  assert.strictEqual(r.positions[0].high, 2.41); assert.strictEqual(r.positions[1], b); assert.strictEqual(a.price, 2.3);
});

test('export/import keeps the quote source marker only when there is a price', () => {
  const { exportState, parseImport } = require('../public/tracker');
  const back = parseImport(exportState({ cash: '1', positions: [{ ticker: 'A', qty: 1, cost: 1, type: 'mid', high: 1, price: 2, priceAt: '2026-11-05T02:45:00.000Z', priceSrc: 'yahoo' }] }));
  assert.strictEqual(back.positions[0].priceSrc, 'yahoo');
  const none = parseImport(JSON.stringify({ app: 'moomooiq', version: 1, positions: [{ ticker: 'A', qty: 1, cost: 1, priceSrc: 'yahoo' }] }));
  assert.strictEqual(none.positions[0].priceSrc, null);
});
