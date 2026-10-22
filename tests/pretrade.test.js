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
