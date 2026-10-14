// Daily brief feed: recent, relevant, scored headlines + notices for a list of tickers.
// GET ?tickers=GAMUDA,INARI (max 12). Stateless; the client decides what matters using its own positions.
const S = require('../../lib/signals');
const { flat } = require('./stocks');

const BASE = 'https://ai-news-search.moomoo.com/news_search';
const MAX_TICKERS = 12, PER_TYPE = 10, MAX_AGE_DAYS = 21, CONCURRENCY = 6;

async function search(keyword, newsType) {
  const url = new URL(BASE);
  url.search = new URLSearchParams({ keyword, size: String(PER_TYPE), news_type: String(newsType), lang: 'en', sort_type: '2' });
  const res = await fetch(url, { headers: { 'User-Agent': 'moomoo-news-search/0.0.2 (Skill)' }, signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`upstream code ${data.code}`);
  return data.data || [];
}

function safeUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)moomoo\.com$/.test(x.hostname) ? x.href : ''; } catch { return ''; }
}

function shape(raw, kind, stock, now) {
  const ts = Number(raw.publish_time) * (Number(raw.publish_time) > 1e11 ? 1 : 1000);
  if (!ts || now - ts > MAX_AGE_DAYS * 864e5) return null;
  if (!S.relevant(raw.title, stock)) return null;
  if (kind === 'notice' && !S.noticeWorthKeeping(raw.title)) return null;
  return { kind, title: S.strip(raw.title), published: new Date(ts).toISOString(), url: safeUrl(raw.url),
    tone: S.tone(raw.title), tags: S.tags(raw.title), exDividend: S.exDividendDate(raw.title) };
}

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
  const jobs = stocks.flatMap((s) => [[s, 'news', 1], [s, 'notice', 2]].map(([st, kind, type]) => async () => ({
    stock: st, kind, rows: await search(S.keywordFor(st), type) })));
  const results = await pool(jobs, CONCURRENCY);

  const now = Date.now(), out = {}, failed = [];
  stocks.forEach((s) => { out[s.ticker] = { name: s.name, items: [] }; });
  for (const r of results) {
    if (!r.ok) { failed.push(String(r.e && r.e.message || r.e)); continue; }
    const { stock, kind, rows } = r.v, seen = new Set(out[stock.ticker].items.map((i) => i.title));
    for (const row of rows) {
      const it = shape(row, kind, stock, now);
      if (it && !seen.has(it.title)) { seen.add(it.title); out[stock.ticker].items.push(it); }
    }
  }
  Object.values(out).forEach((o) => o.items.sort((a, b) => b.published.localeCompare(a.published)));
  if (failed.length === results.length) return json(502, { error: 'News service unreachable' });
  return json(200, { generatedAt: new Date(now).toISOString(), tickers: out, partial: failed.length > 0 },
    { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' });
};
