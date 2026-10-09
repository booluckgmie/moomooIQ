const test = require('node:test');
const assert = require('node:assert');
const { evaluate, portfolio } = require('../public/tracker');

const base = { ticker: 'INARI', qty: 200, cost: 2.12, type: 'mid' };

test('initial stop is cost x 0.92 and trailing never lowers it', () => {
  const r = evaluate({ ...base, price: 2.12 });
  assert.strictEqual(r.stop, 1.95);
  assert.strictEqual(r.action, 'HOLD');
});

test('+10% peak moves stop to at least breakeven, and stops only ratchet up', () => {
  const up = evaluate({ ...base, price: 2.40 });              // +13%
  assert.ok(up.stop >= 2.12);
  const pulled = evaluate({ ...base, price: 2.30, high: 2.40 }); // pulled back, high remembered
  assert.ok(pulled.stop >= up.stop - 1e-9);
});

test('+20% peak locks +10% above cost', () => {
  const r = evaluate({ ...base, price: 2.60 });               // +22.6%
  assert.ok(r.stop >= 2.332);
});

test('+30% suggests trim once; marking trimmed clears it', () => {
  assert.strictEqual(evaluate({ ...base, price: 2.80 }).action, 'TRIM 50%');
  assert.notStrictEqual(evaluate({ ...base, price: 2.80, trimmed: true }).action, 'TRIM 50%');
});

test('sell signal when price falls to the stop', () => {
  const r = evaluate({ ...base, price: 1.95 });
  assert.match(r.action, /SELL/);
});

test('trailing stop from high is tighter for large caps than small caps', () => {
  const small = evaluate({ ...base, type: 'small', high: 3, price: 3 });
  const large = evaluate({ ...base, type: 'large', high: 3, price: 3 });
  assert.ok(large.stop > small.stop);
});

test('-10% with no plan raises an alert; a plan clears it', () => {
  const a = portfolio([{ ...base, price: 1.85 }], 500);
  assert.ok(a.alerts.some((x) => /no written plan/.test(x)));
  const b = portfolio([{ ...base, price: 1.85, plan: 'wait for earnings, stop 1.80' }], 500);
  assert.ok(!b.alerts.some((x) => /no written plan/.test(x)));
});

test('max 3 positions and RM200 cash buffer are flagged', () => {
  const four = ['A', 'B', 'C', 'D'].map((t) => ({ ...base, ticker: t, price: 2.12 }));
  const p = portfolio(four, 150);
  assert.ok(p.alerts.some((x) => /max is 3/.test(x)));
  assert.ok(p.alerts.some((x) => /RM200 buffer/.test(x)));
});

test('INARI worked example: RM71 total on RM424', () => {
  const p = portfolio([{ ...base, qty: 100, price: 2.54 }], 500);
  assert.strictEqual(p.rows[0].pl, 42);
});

const { exportState, parseImport } = require('../public/tracker');

test('export then import round-trips positions and cash', () => {
  const state = { cash: '320', positions: [{ ticker: 'INARI', qty: 200, cost: 2.12, type: 'mid', high: 2.41, price: 2.41, trimmed: true, plan: 'trail' }] };
  const back = parseImport(exportState(state));
  assert.deepStrictEqual(back.positions[0], state.positions[0]);
  assert.strictEqual(back.cash, '320');
});

test('import rejects junk, wrong app, bad numbers and oversize lists', () => {
  const wrap = (positions, extra = {}) => JSON.stringify({ app: 'moomooiq', version: 1, positions, ...extra });
  assert.throws(() => parseImport('nope'), /valid JSON/);
  assert.throws(() => parseImport('{"app":"other","positions":[]}'), /MoomooIQ/);
  assert.throws(() => parseImport(wrap([], { version: 2 })), /version/);
  assert.throws(() => parseImport(wrap([{ ticker: 'X', qty: -1, cost: 1 }])), /positive/);
  assert.throws(() => parseImport(wrap([{ ticker: '<script>', qty: 1, cost: 1 }])), /bad ticker/);
  assert.throws(() => parseImport(wrap(Array(51).fill({ ticker: 'A', qty: 1, cost: 1 }))), /Too many/);
});

test('import drops unknown fields and coerces bad type/plan', () => {
  const r = parseImport(JSON.stringify({ app: 'moomooiq', version: 1, positions: [
    { ticker: 'gamuda', qty: 10, cost: 5, type: 'huge', evil: '<img onerror=x>', plan: 7 }] }));
  assert.deepStrictEqual(Object.keys(r.positions[0]).sort(), ['cost', 'high', 'plan', 'price', 'qty', 'ticker', 'trimmed', 'type']);
  assert.strictEqual(r.positions[0].type, 'mid');
  assert.strictEqual(r.positions[0].ticker, 'GAMUDA');
  assert.strictEqual(r.positions[0].plan, '');
});
