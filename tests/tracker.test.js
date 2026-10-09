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

const { sizeTrade, equityOf } = require('../public/tracker');

test('sizing: 2% risk on RM2,700 at RM2.12 -> 300 shares, loss capped near RM54', () => {
  const r = sizeTrade({ equity: 2700, cash: 2700, entry: 2.12, openCount: 0, riskPct: 0.02 });
  assert.strictEqual(r.qty, 300);
  assert.strictEqual(r.stop, 1.95);
  assert.ok(r.maxLoss <= 2700 * 0.02 + 1e-9);
  assert.strictEqual(r.boundBy, 'risk limit');
});

test('sizing: allocation cap binds on a tight stop budget', () => {
  const r = sizeTrade({ equity: 3000, cash: 3000, entry: 1.0, riskPct: 0.1 });
  assert.match(r.boundBy, /allocation/);
  assert.ok(r.cost <= 1000);
});

test('sizing: cash buffer is kept and can block the trade', () => {
  const r = sizeTrade({ equity: 5000, cash: 300, entry: 2.0, riskPct: 0.02 });
  assert.strictEqual(r.qty, 0);            // only RM100 usable -> under one lot
  assert.match(r.reason, /cash/);
});

test('sizing: refuses a 4th position and bad inputs', () => {
  assert.match(sizeTrade({ equity: 5000, cash: 5000, entry: 2, openCount: 3 }).reason, /max 3/);
  assert.match(sizeTrade({ equity: 5000, cash: 5000, entry: 0 }).reason, /entry/i);
  assert.match(sizeTrade({ equity: 0, cash: 0, entry: 2 }).reason, /cash/i);
  assert.match(sizeTrade({ equity: 5000, cash: 5000, entry: 2, riskPct: 0.5 }).reason, /between/);
});

test('sizing: qty is always a whole lot and loss never exceeds the risk budget', () => {
  for (const entry of [0.35, 0.8, 1.55, 2.12, 4.1, 6.28, 9.9]) {
    const r = sizeTrade({ equity: 2700, cash: 2700, entry, riskPct: 0.02 });
    if (r.qty) {
      assert.strictEqual(r.qty % 100, 0);
      assert.ok(r.maxLoss <= 2700 * 0.02 + 1e-6, `entry ${entry}`);
    }
  }
});

test('equityOf uses live price when set, else cost, plus cash', () => {
  assert.strictEqual(equityOf([{ qty: 100, cost: 2, price: 3 }, { qty: 100, cost: 1 }], 50), 450);
});
