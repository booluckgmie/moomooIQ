const test = require('node:test');
const assert = require('node:assert');
const analyze = require('../netlify/functions/analyze');

const realFetch = global.fetch;
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const okText = (t = 'section') => reply(200, { candidates: [{ content: { parts: [{ text: t }] } }] });
const MODELS = { models: ['gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-pro']
  .map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) };
const NEWS = { code: 0, data: [{ news_id: '1', news_type: 1, title: 'UBS Upgrades <em>Gamuda</em> to Buy From Neutral',
  publish_time: String(Math.floor(Date.now() / 1000) - 86400), url: 'https://www.moomoo.com/news/post/1' }] };

const call = (extra = {}, headers = {}) => analyze.handler({ httpMethod: 'POST', headers,
  body: JSON.stringify({ ticker: 'GAMUDA', name: 'Gamuda', framework: 'catalyst', ...extra }) });
const setup = () => { process.env.GEMINI_API_KEY = 'k'; process.env.ANALYZE_RETRY_MS = '0'; delete process.env.GEMINI_MODEL; delete process.env.ACCESS_TOKEN; analyze._internals.resetModels(); };
// route fetch by URL; `gen(model, bodyText)` decides the Gemini reply
const router = (gen, seen = []) => async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('ai-news-search')) return reply(200, NEWS);
  if (u.includes('?pageSize')) return reply(200, MODELS);
  const model = /models\/([^:]+):generateContent/.exec(u)[1];
  seen.push({ model, body: JSON.parse(opts.body).contents[0].parts[0].text });
  return gen(model, seen.length);
};
test.afterEach(() => { global.fetch = realFetch; });

test('uses the newest discovered flash model and returns one section', async () => {
  setup(); const seen = []; global.fetch = router(() => okText('### hello'), seen);
  const r = await call(); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual([d.framework, d.title, d.text, d.model], ['catalyst', 'Catalyst Breakdown', '### hello', 'gemini-3-flash']);
  assert.strictEqual(seen.length, 1);
});

test('prompt is grounded: today, no-live-data rule, real headlines, user price and slot count', async () => {
  setup(); const seen = []; global.fetch = router(() => okText(), seen);
  await call({ price: 2.12, slots: 1 });
  const p = seen[0].body;
  assert.match(p, /Today is .*2026|Today is .*20\d\d/);
  assert.match(p, /NO live market data/);
  assert.match(p, /UBS Upgrades Gamuda to Buy From Neutral/);       // verified headline, tags stripped
  assert.match(p, /RM2\.12 \(entered by the investor/);
  assert.match(p, /1 of 3 positions used/);
});

test('without a price the prompt forbids guessing one; valuation gets no headlines', async () => {
  setup(); const seen = []; global.fetch = router(() => okText(), seen);
  await call({ framework: 'valuation' });
  assert.match(seen[0].body, /UNKNOWN\. Do not guess a price/);
  assert.ok(!/Recent Moomoo headlines/.test(seen[0].body));
});

test('scenarios prompt carries the investor rules and the slot question', async () => {
  setup(); const seen = []; global.fetch = router(() => okText(), seen);
  await call({ framework: 'scenarios' });
  assert.match(seen[0].body, /initial stop 8% below entry/);
  assert.match(seen[0].body, /trim 50% at \+30%/);
  assert.match(seen[0].body, /at most 3 positions/);
});

test('a transient 503 is retried and succeeds', async () => {
  setup(); let n = 0; global.fetch = router(() => (++n === 1 ? reply(503, { error: { message: 'high demand' } }) : okText('recovered')));
  const r = await call();
  assert.strictEqual(r.statusCode, 200); assert.strictEqual(JSON.parse(r.body).text, 'recovered'); assert.strictEqual(n, 2);
});

test('a persistently busy model falls back to the next model', async () => {
  setup(); const seen = [];
  global.fetch = router((m) => (m === 'gemini-3-flash' ? reply(503, { error: { message: 'busy' } }) : okText('from fallback')), seen);
  const d = JSON.parse((await call()).body);
  assert.strictEqual(d.model, 'gemini-2.5-flash'); assert.strictEqual(d.text, 'from fallback');
  assert.deepStrictEqual(seen.map((x) => x.model), ['gemini-3-flash', 'gemini-3-flash', 'gemini-2.5-flash']);
});

test('a retired model (404) skips straight to the next one without retrying it', async () => {
  setup(); const seen = [];
  global.fetch = router((m) => (m === 'gemini-3-flash' ? reply(404, { error: { message: 'not found' } }) : okText('ok')), seen);
  const d = JSON.parse((await call()).body);
  assert.strictEqual(d.model, 'gemini-2.5-flash');
  assert.deepStrictEqual(seen.map((x) => x.model), ['gemini-3-flash', 'gemini-2.5-flash']);
});

test('timeouts become a friendly retryable error, never the raw "operation was aborted"', async () => {
  setup(); global.fetch = router(() => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; });
  const r = await call(); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 503); assert.strictEqual(d.retryable, true);
  assert.match(d.error, /took too long/); assert.ok(!/aborted/.test(d.error));
});

test('a fatal error (bad key) fails fast with the API message and is not retryable', async () => {
  setup(); let n = 0; global.fetch = router(() => { n++; return reply(400, { error: { message: 'API key not valid' } }); });
  const r = await call(); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 502); assert.strictEqual(d.retryable, false); assert.match(d.error, /API key not valid/); assert.strictEqual(n, 1);
});

test('input and auth validation', async () => {
  setup();
  assert.strictEqual((await call({ framework: 'nope' })).statusCode, 400);
  assert.strictEqual((await call({ ticker: '<bad>' })).statusCode, 400);
  process.env.ACCESS_TOKEN = 'sekret';
  assert.strictEqual((await call()).statusCode, 401);
  assert.strictEqual((await call({}, { 'x-access-token': 'wrong' })).statusCode, 401);
  global.fetch = router(() => okText());
  assert.strictEqual((await call({}, { 'x-access-token': 'sekret' })).statusCode, 200);
  delete process.env.ACCESS_TOKEN;
});

test('headline lookup failure never blocks the analysis', async () => {
  setup(); global.fetch = async (url, opts) => { if (String(url).includes('ai-news-search')) throw new Error('down'); return router(() => okText())(url, opts); };
  const d = JSON.parse((await call({ ticker: 'MAXIS', name: 'Maxis' })).body); assert.strictEqual(d.headlines, 0); assert.strictEqual(d.text, 'section');
});
