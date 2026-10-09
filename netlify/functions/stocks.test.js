const test = require('node:test');
const assert = require('node:assert');
const { flat } = require('./stocks');

test('stock universe has 35+ unique tickers', () => {
  const all = flat();
  assert.ok(all.length >= 35);
  assert.strictEqual(new Set(all.map((s) => s.ticker)).size, all.length);
  assert.strictEqual(new Set(all.map((s) => s.code)).size, all.length);
});
