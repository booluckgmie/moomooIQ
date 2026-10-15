// Daily brief feed: recent, relevant, scored headlines + notices for a list of tickers.
// GET ?tickers=GAMUDA,INARI (max 12). Stateless; the client decides what matters using its own positions.
const S = require('../../lib/signals');
const { flat } = require('./stocks');

const F = require('../../lib/newsfeed');
const MAX_TICKERS = 12, MAX_AGE_DAYS = 21, CONCURRENCY = 6;

async function pool(jobs, n) {
  const out = new Array(jobs.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) { const k = i++; out[k] = await jobs[k]().then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })); }
  }));
  return out;
}

exports.handler = async (event) => {
  const json = (statusCode, body, extra = {}) => ({ statusCode,
    headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
  const raw = ((event.queryStringParameters || {}).tickers || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const tickers = [...new Set(raw)];
  if (!tickers.length) return json(400, { error: 'tickers required' });
  if (tickers.length > MAX_TICKERS) return json(400, { error: `max ${MAX_TICKERS} tickers` });
  if (tickers.some((t) => !/^[A-Z0-9.&-]{1,20}$/.test(t))) return json(400, { error: 'invalid ticker' });

  const universe = Object.fromEntries(flat().map((s) => [s.ticker, s]));
  const stocks = tickers.map((t) => universe[t] || { ticker: t, name: t });   // unknown tickers search by their own text
  const jobs = stocks.flatMap((s) => [[s, 'news'], [s, 'notice']].map(([st, kind]) => async () => ({
    stock: st, kind, rows: await F.search(S.keywordFor(st), kind) })));
  const results = await pool(jobs, CONCURRENCY);

  const now = Date.now(), out = {}, failed = [];
  stocks.forEach((s) => { out[s.ticker] = { name: s.name, items: [] }; });
  for (const r of results) {
    if (!r.ok) { failed.push(String(r.e && r.e.message || r.e)); continue; }
    const { stock, kind, rows } = r.v, seen = new Set(out[stock.ticker].items.map((i) => i.title));
    for (const row of rows) {
      const it = F.shape(row, kind, stock, now, MAX_AGE_DAYS);
      if (it && !seen.has(it.title)) { seen.add(it.title); out[stock.ticker].items.push(it); }
    }
  }
  Object.values(out).forEach((o) => o.items.sort((a, b) => b.published.localeCompare(a.published)));
  if (failed.length === results.length) return json(502, { error: 'News service unreachable' });
  return json(200, { generatedAt: new Date(now).toISOString(), tickers: out, partial: failed.length > 0 },
    { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' });
};
