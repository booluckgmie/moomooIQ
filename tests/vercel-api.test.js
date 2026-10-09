const test = require('node:test');
const assert = require('node:assert');
const adapt = require('../api/_adapt');

const mockRes = () => {
  const r = { headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; },
    send(b) { r.body = b; return r; }, json(o) { r.body = JSON.stringify(o); return r; } };
  return r;
};

test('adapter passes method, query and string body; relays status/headers/body', async () => {
  let seen;
  const h = adapt(async (e) => { seen = e; return { statusCode: 201, headers: { 'content-type': 'application/json' }, body: '{"ok":1}' }; });
  const res = mockRes();
  await h({ method: 'POST', url: '/api/x?keyword=GAMUDA&type=news', headers: { a: 'b' }, body: '{"t":1}' }, res);
  assert.deepStrictEqual([seen.httpMethod, seen.queryStringParameters.keyword, seen.body], ['POST', 'GAMUDA', '{"t":1}']);
  assert.deepStrictEqual([res.code, res.body, res.headers['content-type']], [201, '{"ok":1}', 'application/json']);
});

test('adapter re-serialises parsed JSON bodies and hides handler errors', async () => {
  let seen;
  await adapt(async (e) => { seen = e; return { statusCode: 200, body: '' }; })({ method: 'POST', url: '/api/x', body: { a: 1 } }, mockRes());
  assert.strictEqual(seen.body, '{"a":1}');
  const res = mockRes();
  await adapt(async () => { throw new Error('secret detail'); })({ method: 'GET', url: '/api/x' }, res);
  assert.strictEqual(res.code, 500);
  assert.ok(!res.body.includes('secret'));
});

test('stocks endpoint works through the adapter', async () => {
  const res = mockRes();
  await require('../api/stocks')({ method: 'GET', url: '/api/stocks' }, res);
  assert.strictEqual(res.code, 200);
  assert.ok(JSON.parse(res.body).stocks.length >= 35);
});

test('analyze enforces ACCESS_TOKEN when configured', async () => {
  process.env.ACCESS_TOKEN = 'sekret'; process.env.GEMINI_API_KEY = 'k';
  const call = async (tok) => { const r = mockRes();
    await require('../api/analyze')({ method: 'POST', url: '/api/analyze', headers: tok ? { 'x-access-token': tok } : {}, body: '{"ticker":"BAD<>"}' }, r); return r; };
  assert.strictEqual((await call()).code, 401);
  assert.strictEqual((await call('wrong!')).code, 401);
  assert.strictEqual((await call('sekret')).code, 400);   // passes auth, fails ticker validation (no Gemini call)
  delete process.env.ACCESS_TOKEN;
});
