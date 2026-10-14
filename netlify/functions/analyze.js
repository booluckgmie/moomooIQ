// 3-framework Bursa Malaysia stock analysis via Gemini. POST { ticker, name }.
const crypto = require('node:crypto');
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const FRAMEWORKS = {
  catalyst: (s) => `Act as an institutional equity analyst. Stock: ${s} (Bursa Malaysia).
Catalyst Breakdown: 1) current price setup, 2) the dominant narrative, 3) the REAL catalyst vs noise,
4) institutional view, 5) verdict. Be concise, use headings, flag anything you cannot verify.`,
  valuation: (s) => `Act as an institutional equity analyst. Stock: ${s} (Bursa Malaysia).
Financial Health & Competitive Valuation: key metrics (P/E, P/B, ROE, debt, FCF, dividend payout),
a 5-peer comparison markdown table, and a valuation verdict (cheap/fair/expensive). Flag red flags such as
negative FCF or payout ratio above 100%.`,
  scenarios: (s) => `Act as an institutional equity analyst. Stock: ${s} (Bursa Malaysia).
Sentiment + Scenarios + Trade Plan: retail sentiment, analyst projections, four price scenarios
(Bear/Base/Bull/Stretched) with rough probabilities, and an entry / trim / stop-loss plan.
Max 3 positions rule: say whether this deserves a slot.`,
};

const FALLBACK_MODEL = 'gemini-2.5-flash';
let discovered = null;                                   // survives warm invocations

// Google retires model names, so don't hard-code one. GEMINI_MODEL wins; otherwise ask the API what
// this key can use and take the newest stable "flash" (generous free-tier limits for 3 parallel calls).
async function pickModel() {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (discovered) return discovered;
  try {
    const res = await fetch(`${GEMINI}?pageSize=1000`, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return FALLBACK_MODEL;
    const names = ((await res.json()).models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n));
    names.sort((a, b) => parseFloat(b.split('-')[1]) - parseFloat(a.split('-')[1]));
    if (names[0]) discovered = names[0];
    return discovered || FALLBACK_MODEL;
  } catch { return FALLBACK_MODEL; }
}

function apiMessage(status, text) {
  let msg = text;
  try { msg = JSON.parse(text).error.message || text; } catch { /* not JSON */ }
  return `Gemini ${status}: ${String(msg).replace(/\s+/g, ' ').slice(0, 220)}`;
}

async function gemini(prompt, model) {
  const res = await fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) throw new Error(apiMessage(res.status, await res.text()));
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '(no output)';
}

exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (process.env.ACCESS_TOKEN) {
    const got = Buffer.from(String((event.headers || {})['x-access-token'] || ''));
    const want = Buffer.from(process.env.ACCESS_TOKEN);
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return json(401, { error: 'Access token required' });
  }
  if (!process.env.GEMINI_API_KEY) return json(500, { error: 'GEMINI_API_KEY not set' });

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { ticker, name } = input;
  if (!ticker || !/^[A-Za-z0-9 .&-]{1,40}$/.test(ticker)) return json(400, { error: 'Invalid ticker' });
  const label = name ? `${ticker} (${name})` : ticker;

  const model = await pickModel();
  const keys = Object.keys(FRAMEWORKS);
  const settled = await Promise.allSettled(keys.map((k) => gemini(FRAMEWORKS[k](label), model)));
  if (settled.every((r) => r.status === 'rejected'))      // one clear error instead of three copies
    return json(502, { error: `${settled[0].reason.message} (model: ${model})` });
  const result = {};
  settled.forEach((r, i) => {
    result[keys[i]] = r.status === 'fulfilled' ? r.value : `Error: ${r.reason.message}`;
  });
  return json(200, { ticker, model, ...result, disclaimer: 'Educational only. Not financial advice.' });
};

exports._resetModelCache = () => { discovered = null; };
