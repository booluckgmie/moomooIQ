// Delayed Bursa quotes for a ticker list. GET ?tickers=INARI,GAMUDA (max 12).
// Source: Yahoo Finance (unofficial, ~15 min delayed). Answers per-ticker failures instead of failing as a whole.
const P = require('../../lib/prices');
const { flat } = require('./stocks');
const MAX = 12, CONCURRENCY = 4;

async function pool(jobs, n) {
  const out = new Array(jobs.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) { const k = i++; out[k] = await jobs[k]().then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })); }
  }));
  return out;
}

exports.handler = async (event) => {
  const json = (statusCode, body, cache) => ({ statusCode,
    headers: { 'content-type': 'application/json', ...(cache ? { 'cache-control': cache } : {}) }, body: JSON.stringify(body) });
  const tickers = [...new Set(((event.queryStringParameters || {}).tickers || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!tickers.length) return json(400, { error: 'tickers required' });
  if (tickers.length > MAX) return json(400, { error: `max ${MAX} tickers` });
  if (tickers.some((t) => !/^[A-Z0-9.&-]{1,20}$/.test(t))) return json(400, { error: 'invalid ticker' });

  const universe = Object.fromEntries(flat().map((s) => [s.ticker, s]));
  const quotes = {}, failed = [], jobs = [];
  for (const t of tickers) {
    const sym = P.symbolFor(universe[t]);
    if (!sym) { failed.push({ ticker: t, reason: 'not in the stock list' }); continue; }
    jobs.push(async () => { try { return { t, c: await P.chart(sym, '5d') }; } catch (e) { e.t = t; throw e; } });
  }
  (await pool(jobs, CONCURRENCY)).forEach((r) => {
    if (!r.ok) { failed.push({ ticker: r.e && r.e.t, reason: 'quote unavailable' }); return; }
    const { t, c } = r.v;
    quotes[t] = { price: c.price, time: c.time ? new Date(c.time).toISOString() : null, prevClose: c.prevClose,
      changePct: c.prevClose ? Math.round((c.price / c.prevClose - 1) * 10000) / 10000 : null, currency: c.currency,
      dayHigh: c.dayHigh, dayLow: c.dayLow };
  });
  const clean = failed;
  if (!Object.keys(quotes).length) return json(502, { error: 'Price service unavailable right now', failed: clean });
  return json(200, { quotes, failed: clean, source: 'Yahoo Finance (delayed)', generatedAt: new Date().toISOString() },
    'public, s-maxage=60, stale-while-revalidate=300');
};
