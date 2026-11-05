const test = require('node:test');
const assert = require('node:assert');
const M = require('../public/moomoo');

const UNIVERSE = [{ ticker: 'GAMUDA', code: '5398', name: 'Gamuda' }, { ticker: 'INARI', code: '0166', name: 'Inari Amertron' }];
// shape taken from get_portfolio.py --json
const row = (o) => ({ code: 'MY.5398', name: 'GAMUDA', qty: 100, can_sell_qty: 100, average_cost: 5.0, nominal_price: 5.2, market_val: 520,
  unrealized_pl: 20, pl_ratio_avg_cost: 4, position_type: 'LONG', acc_id: 123456789, ...o });
const answer = (positions, funds) => ({ funds: funds === undefined ? { currency: 'MYR', cash: 1200, frozen_cash: 200, total_assets: 5000, power: 99999 } : funds, positions });

test('parses a Bursa position; known stocks map to the app ticker, leading zeros do not matter', () => {
  const r = M.parseBrokerPortfolio(answer([row(), row({ code: 'MY.166', name: 'INARI', qty: 200, average_cost: 2.12, nominal_price: 2.28 })]), UNIVERSE);
  assert.deepStrictEqual(r.positions.map((p) => [p.ticker, p.qty, p.cost, p.price, p.known]), [['GAMUDA', 100, 5, 5.2, true], ['INARI', 200, 2.12, 2.28, true]]);
  assert.deepStrictEqual(r.skipped, []);
});

test('funds: free cash is cash minus frozen cash; buying power and account ids are ignored', () => {
  const r = M.parseBrokerPortfolio(answer([row()]), UNIVERSE);
  assert.deepStrictEqual(r.funds, { currency: 'MYR', cash: 1200, frozen: 200, free: 1000 });
  assert.ok(!JSON.stringify(r).includes('123456789') && !JSON.stringify(r).includes('99999'));
  assert.strictEqual(M.parseBrokerPortfolio(answer([row()], {}), UNIVERSE).funds, null);
});

test('skips what the tracker cannot model, and says why', () => {
  const r = M.parseBrokerPortfolio(answer([
    row(), row({ code: 'US.AAPL', name: 'APPLE' }), row({ code: 'MY.5398C2612', name: 'GAMUDA-C' }),
    row({ code: 'MY.6012', name: 'MAXIS', position_type: 'SHORT' }), row({ code: 'MY.1155', name: 'MAYBANK', qty: 0 }),
    row({ code: 'MY.1295', name: 'PBBANK', average_cost: 0 })]), UNIVERSE);
  assert.strictEqual(r.positions.length, 1);
  assert.deepStrictEqual(r.skipped.map((s) => s.reason), ['not a Bursa position', 'not a plain stock code (options and similar are not tracked)',
    'short position', 'no shares held', 'no cost basis reported']);
});

test('stocks outside the built-in list keep a cleaned name as ticker and remember their code', () => {
  const r = M.parseBrokerPortfolio(answer([row({ code: 'MY.0053', name: 'OPPSTAR <Bhd>', qty: 300, average_cost: 0.73 })]), UNIVERSE);
  assert.deepStrictEqual([r.positions[0].ticker, r.positions[0].code, r.positions[0].known], ['OPPSTAR', '0053', false]);   // spaces and 'BHD' dropped
  const multi = M.parseBrokerPortfolio(answer([row({ code: 'MY.5263', name: 'Sunway Construction Group Bhd' })]), []);
  assert.match(multi.positions[0].ticker, /^[A-Z0-9.&-]{1,20}$/); assert.strictEqual(multi.positions[0].ticker, 'SUNWAYCONSTRUCTION');
});

test('the same stock reported twice is combined with a weighted average cost', () => {
  const r = M.parseBrokerPortfolio(answer([row({ qty: 100, average_cost: 5 }), row({ qty: 300, average_cost: 4 })]), UNIVERSE);
  assert.deepStrictEqual([r.positions.length, r.positions[0].qty, r.positions[0].cost], [1, 400, 4.25]);
});

test('bad or error answers throw readable errors', () => {
  assert.throws(() => M.parseBrokerPortfolio(null, UNIVERSE), /Unexpected answer/);
  assert.throws(() => M.parseBrokerPortfolio({ error: 'script failed' }, UNIVERSE), /script failed/);
  assert.throws(() => M.parseBrokerPortfolio({ funds: {} }, UNIVERSE), /no positions list/);
});

const imp = (o) => ({ ticker: 'GAMUDA', code: '5398', name: 'GAMUDA', known: true, qty: 200, cost: 4.9, price: 5.1, ...o });
const NOW = Date.parse('2026-11-05T12:00:00Z');
const mine = (o) => ({ ticker: 'GAMUDA', qty: 100, cost: 5, type: 'large', high: 5.6, price: 5.0, priceAt: '2026-11-04T09:00:00.000Z', trimmed: true, plan: 'hold to results', ...o });

test('merge: updates shares/cost/price but keeps your notes, cap size, trimmed flag and high-water mark', () => {
  const r = M.mergeBrokerPositions([mine()], [imp()], { nowMs: NOW });
  const p = r.positions[0];
  assert.deepStrictEqual([p.qty, p.cost, p.price, p.priceSrc, p.priceAt], [200, 4.9, 5.1, 'moomoo', '2026-11-05T12:00:00.000Z']);
  assert.deepStrictEqual([p.type, p.trimmed, p.plan, p.high], ['large', true, 'hold to results', 5.6]);
  assert.deepStrictEqual(r.updated, [{ ticker: 'GAMUDA', qtyFrom: 100, qtyTo: 200, costFrom: 5, costTo: 4.9 }]);
});

test('merge: new positions are added with the chosen cap size (default mid), no notes', () => {
  const r = M.mergeBrokerPositions([], [imp({ ticker: 'INARI', code: '0166', qty: 200, cost: 2.12, price: 2.28 })], { nowMs: NOW, types: { INARI: 'small' } });
  assert.deepStrictEqual([r.positions[0].type, r.positions[0].trimmed, r.positions[0].plan, r.positions[0].high], ['small', false, '', 2.28]);
  assert.deepStrictEqual(r.added, [{ ticker: 'INARI', qty: 200, cost: 2.12 }]);
  assert.strictEqual(M.mergeBrokerPositions([], [imp()], { nowMs: NOW, types: { GAMUDA: 'huge' } }).positions[0].type, 'mid');
});

test('merge: positions missing from Moomoo are kept unless you ask to remove them; unchanged ones are reported', () => {
  const keep = M.mergeBrokerPositions([mine({ ticker: 'SIME' }), mine({ qty: 200, cost: 4.9 })], [imp()], { nowMs: NOW });
  assert.deepStrictEqual([keep.missing, keep.removed, keep.unchanged, keep.positions.map((p) => p.ticker)], [['SIME'], [], ['GAMUDA'], ['GAMUDA', 'SIME']]);
  const drop = M.mergeBrokerPositions([mine({ ticker: 'SIME' })], [imp()], { nowMs: NOW, removeMissing: true });
  assert.deepStrictEqual([drop.removed, drop.positions.map((p) => p.ticker)], [['SIME'], ['GAMUDA']]);
});

test('merge: unknown stocks carry their code; known stocks do not; input is never mutated; a missing price leaves it unset', () => {
  const ex = [mine()], snapshot = JSON.stringify(ex);
  const r = M.mergeBrokerPositions(ex, [imp({ known: false, code: '0053', ticker: 'OPPSTAR', price: null })], { nowMs: NOW });
  assert.strictEqual(JSON.stringify(ex), snapshot);
  const p = r.positions.find((x) => x.ticker === 'OPPSTAR');
  assert.deepStrictEqual([p.code, p.price, p.priceAt, p.priceSrc], ['0053', null, null, null]);
  assert.ok(!('code' in M.mergeBrokerPositions([], [imp()], { nowMs: NOW }).positions[0]));
});

test('plain-language bridge errors', () => {
  const e = M.explainBridgeError;
  assert.match(e(0, null, true), /Cannot reach the bridge.*Chrome or Firefox/);
  assert.match(e(401, { error: 'unauthorized' }), /token is wrong/);
  assert.match(e(400, { error: 'REAL disabled; start the bridge with BRIDGE_ALLOW_REAL=1' }), /BRIDGE_ALLOW_REAL=1.*read-only/);
  assert.match(e(502, { error: 'script failed', detail: { output: '[ERROR] Cannot connect to OpenD (127.0.0.1:11111): refused' } }), /OpenD is not running/);
  assert.match(e(502, { error: 'script failed', detail: { output: '[ERROR] moomoo-api not installed. Please run /install-moomoo-opend' } }), /pip install moomoo-api/);
  assert.match(e(504, { error: 'OpenD call timed out' }), /took too long/);
  assert.match(e(502, { error: 'script failed', detail: 'Traceback boom' }), /Moomoo answered with an error: script failed Traceback boom/);
  assert.match(e(500, {}), /\(500\)/);
});
