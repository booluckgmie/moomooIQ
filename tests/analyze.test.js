const test = require('node:test');
const assert = require('node:assert');
const analyze = require('../netlify/functions/analyze');

const realFetch = global.fetch;
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const call = (extra = {}) => analyze.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ ticker: 'GAMUDA', name: 'Gamuda', ...extra }) });
const setup = () => { process.env.GEMINI_API_KEY = 'k'; delete process.env.GEMINI_MODEL; delete process.env.ACCESS_TOKEN; analyze._resetModelCache(); };
test.afterEach(() => { global.fetch = realFetch; });

test('discovers the newest stable flash model instead of a hard-coded name', async () => {
  setup(); const used = [];
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('?pageSize')) return reply(200, { models: [
      { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent'] }] });
    used.push(u); return reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  };
  const r = await call(); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(d.model, 'gemini-3-flash');
  assert.strictEqual(used.length, 3);
  assert.ok(used.every((u) => u.includes('/gemini-3-flash:generateContent')));
});

test('GEMINI_MODEL overrides discovery', async () => {
  setup(); process.env.GEMINI_MODEL = 'gemini-custom'; let listed = false;
  global.fetch = async (url) => { if (String(url).includes('?pageSize')) listed = true; return reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }); };
  const d = JSON.parse((await call()).body);
  assert.strictEqual(d.model, 'gemini-custom'); assert.strictEqual(listed, false);
  delete process.env.GEMINI_MODEL;
});

test('falls back to gemini-2.5-flash when model listing fails', async () => {
  setup();
  global.fetch = async (url) => String(url).includes('?pageSize') ? reply(500, {}) : reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  assert.strictEqual(JSON.parse((await call()).body).model, 'gemini-2.5-flash');
});

test('when every call fails the user gets ONE readable error, not three JSON blobs', async () => {
  setup();
  global.fetch = async (url) => String(url).includes('?pageSize') ? reply(200, { models: [] })
    : reply(404, { error: { code: 404, message: 'models/x is not found for API version v1beta', status: 'NOT_FOUND' } });
  const r = await call(); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 502);
  assert.match(d.error, /^Gemini 404: models\/x is not found/);
  assert.ok(!d.error.includes('{'));
});

test('partial failure still returns the sections that worked', async () => {
  setup(); let n = 0;
  global.fetch = async (url) => String(url).includes('?pageSize') ? reply(200, { models: [] })
    : (++n === 2 ? reply(429, { error: { message: 'quota' } }) : reply(200, { candidates: [{ content: { parts: [{ text: 'section' }] } }] }));
  const r = await call(); const d = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual([d.catalyst, d.valuation, d.scenarios].filter((x) => x === 'section').length, 2);
  assert.ok([d.catalyst, d.valuation, d.scenarios].some((x) => /^Error: Gemini 429: quota/.test(x)));
});
