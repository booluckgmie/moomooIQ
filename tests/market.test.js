const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/prices');
const quotes = require('../netlify/functions/quotes');
const odds = require('../netlify/functions/odds');
const fixture = require('./fixtures/yahoo-5398.KL.json');

const realFetch = global.fetch;
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
test.afterEach(() => { global.fetch = realFetch; P._cache.clear(); });

test('quotes: returns delayed price, previous close and change for known tickers', async () => {
  const seen = []; global.fetch = async (u) => { seen.push(String(u)); return reply(200, fixture); };
  const r = await quotes.handler({ queryStringParameters: { tickers: 'gamuda' } }); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200);
  assert.ok(d.quotes.GAMUDA.price > 0 && d.quotes.GAMUDA.prevClose > 0);
  assert.match(d.quotes.GAMUDA.time, /^20\d\d-\d\d-\d\dT/);
  assert.ok(/5398\.KL.*range=5d&interval=1d/.test(seen[0]));
  assert.match(r.headers['cache-control'], /s-maxage=60/);
});

test('quotes: unknown tickers are reported, not fatal; bad input is rejected', async () => {
  global.fetch = async () => reply(200, fixture);
  const d = JSON.parse((await quotes.handler({ queryStringParameters: { tickers: 'GAMUDA,NOSUCH' } })).body);
  assert.ok(d.quotes.GAMUDA); assert.deepStrictEqual(d.failed, [{ ticker: 'NOSUCH', reason: 'not in the stock list' }]);
  assert.strictEqual((await quotes.handler({ queryStringParameters: {} })).statusCode, 400);
  assert.strictEqual((await quotes.handler({ queryStringParameters: { tickers: 'A,B,C,D,E,F,G,H,I,J,K,L,M' } })).statusCode, 400);
  assert.strictEqual((await quotes.handler({ queryStringParameters: { tickers: '<x>' } })).statusCode, 400);
});

test('quotes: a rate-limited first host falls back to the second; total outage is a clean 502', async () => {
  let n = 0; global.fetch = async (u) => (++n === 1 ? reply(429, {}) : reply(200, fixture));
  assert.strictEqual((await quotes.handler({ queryStringParameters: { tickers: 'GAMUDA' } })).statusCode, 200);
  assert.strictEqual(n, 2);
  P._cache.clear(); global.fetch = async () => reply(503, {});
  const r = await quotes.handler({ queryStringParameters: { tickers: 'GAMUDA' } });
  assert.strictEqual(r.statusCode, 502); assert.ok(!/Yahoo|503/.test(JSON.parse(r.body).error));   // no upstream detail leaks
});

test('quotes: one failing ticker does not hide the others, and failures are attributed', async () => {
  global.fetch = async (u) => (String(u).includes('0166.KL') ? reply(404, {}) : reply(200, fixture));
  const d = JSON.parse((await quotes.handler({ queryStringParameters: { tickers: 'GAMUDA,INARI' } })).body);
  assert.ok(d.quotes.GAMUDA && !d.quotes.INARI);
  assert.deepStrictEqual(d.failed.map((f) => f.ticker), ['INARI']);
});

test('odds: returns a replay and market summary for the requested rules', async () => {
  global.fetch = async () => reply(200, fixture);
  const r = await odds.handler({ queryStringParameters: { ticker: 'GAMUDA', stop: '0.08', target: '0.2', horizon: '10' } }); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200);
  assert.ok(d.summary.last > 0 && d.summary.high52 >= d.summary.low52);
  assert.ok(d.odds.ok === false || Math.abs(d.odds.targetPct + d.odds.stopPct + d.odds.neitherPct - 1) < 0.01);
  assert.match(r.headers['cache-control'], /s-maxage=1800/);
});

test('odds: validates input and unknown tickers', async () => {
  global.fetch = async () => reply(200, fixture);
  const call = (q) => odds.handler({ queryStringParameters: q });
  assert.strictEqual((await call({})).statusCode, 400);
  assert.strictEqual((await call({ ticker: 'GAMUDA', stop: '0.9' })).statusCode, 400);
  assert.strictEqual((await call({ ticker: 'GAMUDA', horizon: '500' })).statusCode, 400);
  assert.strictEqual((await call({ ticker: 'GAMUDA', stop: 'abc' })).statusCode, 400);
  assert.strictEqual((await call({ ticker: 'NOSUCH' })).statusCode, 404);
  global.fetch = async () => reply(500, {});
  assert.strictEqual((await call({ ticker: 'GAMUDA' })).statusCode, 502);
});
