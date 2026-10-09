// 3-framework Bursa Malaysia stock analysis via Gemini. POST { ticker, name }.
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

async function gemini(prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  const res = await fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '(no output)';
}

exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  if (!process.env.GEMINI_API_KEY) return json(500, { error: 'GEMINI_API_KEY not set' });

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const { ticker, name } = input;
  if (!ticker || !/^[A-Za-z0-9 .&-]{1,40}$/.test(ticker)) return json(400, { error: 'Invalid ticker' });
  const label = name ? `${ticker} (${name})` : ticker;

  const keys = Object.keys(FRAMEWORKS);
  const settled = await Promise.allSettled(keys.map((k) => gemini(FRAMEWORKS[k](label))));
  const result = {};
  settled.forEach((r, i) => {
    result[keys[i]] = r.status === 'fulfilled' ? r.value : `Error: ${r.reason.message}`;
  });
  return json(200, { ticker, ...result, disclaimer: 'Educational only. Not financial advice.' });
};
