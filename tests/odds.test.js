const test = require('node:test');
const assert = require('node:assert');
const O = require('../lib/odds');
const P = require('../lib/prices');

// flat series of `n` bars at price 100 with tiny range
const flat = (n, c = 100) => Array.from({ length: n }, (_, i) => ({ day: `d${i}`, o: c, h: c + 0.5, l: c - 0.5, c, v: 1 }));

test('flat market: nothing ever hits the stop or the target', () => {
  const r = O.replay(flat(120), { stop: 0.08, target: 0.2, horizon: 30 });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.neitherPct, 1); assert.strictEqual(r.targetPct + r.stopPct, 0);
  assert.strictEqual(r.starts, 90);                       // 120 bars - 30 horizon
});

test('a steady climb hits the target first from every start; a steady fall hits the stop', () => {
  const up = Array.from({ length: 100 }, (_, i) => { const c = 100 * Math.pow(1.01, i); return { day: `d${i}`, o: c, h: c * 1.002, l: c * 0.998, c, v: 1 }; });
  const dn = Array.from({ length: 100 }, (_, i) => { const c = 100 * Math.pow(0.99, i); return { day: `d${i}`, o: c, h: c * 1.002, l: c * 0.998, c, v: 1 }; });
  assert.strictEqual(O.replay(up).targetPct, 1);
  assert.strictEqual(O.replay(dn).stopPct, 1);
  assert.ok(O.replay(up).medianDaysToTarget <= 20);       // 1%/day compounds to +20% in about 19 days
});

test('a bar that touches both the stop and the target counts as a STOP (worst case)', () => {
  const bars = flat(80); bars[11] = { day: 'x', o: 100, h: 125, l: 90, c: 100, v: 1 };   // wild bar: both levels in one day
  const r = O.replay(bars, { horizon: 30 });
  assert.ok(r.stopPct > 0 && r.targetPct === 0);
});

test('too little history is reported honestly instead of guessed', () => {
  const r = O.replay(flat(50), { horizon: 30 });
  assert.deepStrictEqual([r.ok, r.reason, r.starts], [false, 'not enough history', 20]);
});

test('ATR% is the average true range over the last close; summary gives 52w range and changes', () => {
  const bars = flat(70).map((b) => ({ ...b, h: 102, l: 98 }));       // true range 4 on price 100
  assert.strictEqual(O.atrPct(bars), 0.04);
  const s = O.summary(bars);
  assert.deepStrictEqual([s.last, s.high52, s.low52, s.chg1m, s.chg3m, s.atrPct], [100, 102, 98, 0, 0, 0.04]);
  assert.strictEqual(O.atrPct(flat(5)), null);
});

const yahoo = require('./fixtures/yahoo-5398.KL.json');
test('parseChart on a real Yahoo response: MYR prices, one bar per day, clean numbers', () => {
  const c = P.parseChart(yahoo);
  assert.strictEqual(c.symbol, '5398.KL'); assert.strictEqual(c.currency, 'MYR');
  assert.ok(c.price > 0 && c.time > 1.7e12);
  assert.ok(c.bars.length > 40 && c.bars.length <= 80);
  assert.strictEqual(new Set(c.bars.map((b) => b.day)).size, c.bars.length);      // no duplicate days
  assert.ok(c.bars.every((b) => b.l <= b.c && b.c <= b.h || Math.abs(b.c - b.h) < 1e-9 || Math.abs(b.c - b.l) < 1e-9));
  assert.ok(c.bars.every((b) => Math.abs(b.c * 1000 - Math.round(b.c * 1000)) < 1e-6));   // no 4.940000057 noise
  assert.ok(c.prevClose > 0);
});

test('parseChart rejects empty or error payloads; symbolFor builds Bursa symbols safely', () => {
  assert.throws(() => P.parseChart({ chart: { result: null, error: { description: 'No data found' } } }), /No data found/);
  assert.throws(() => P.parseChart({}), /no chart data/);
  assert.strictEqual(P.symbolFor({ code: '5398' }), '5398.KL');
  assert.strictEqual(P.symbolFor({ code: '0166' }), '0166.KL');
  assert.strictEqual(P.symbolFor({ code: '../x' }), null); assert.strictEqual(P.symbolFor({}), null);
});
