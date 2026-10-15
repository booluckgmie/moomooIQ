// Moomoo news/notice fetching shared by /api/brief (Today page) and /api/analyze (AI grounding).
const S = require('./signals');

const BASE = 'https://ai-news-search.moomoo.com/news_search';
const TYPES = { news: 1, notice: 2 };
const TTL_MS = 5 * 60e3;
const cache = new Map();                                  // survives warm invocations; keeps upstream calls down

async function search(keyword, kind, size = 10) {
  const key = `${keyword}|${kind}|${size}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const url = new URL(BASE);
  url.search = new URLSearchParams({ keyword, size: String(size), news_type: String(TYPES[kind]), lang: 'en', sort_type: '2' });
  const res = await fetch(url, { headers: { 'User-Agent': 'moomoo-news-search/0.0.2 (Skill)' }, signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`upstream code ${data.code}`);
  const rows = data.data || [];
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

function safeUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)moomoo\.com$/.test(x.hostname) ? x.href : ''; } catch { return ''; }
}

function shape(raw, kind, stock, now, maxAgeDays = 21) {
  const ts = Number(raw.publish_time) * (Number(raw.publish_time) > 1e11 ? 1 : 1000);
  if (!ts || now - ts > maxAgeDays * 864e5) return null;
  if (!S.relevant(raw.title, stock)) return null;
  if (kind === 'notice' && !S.noticeWorthKeeping(raw.title)) return null;
  return { kind, title: S.strip(raw.title), published: new Date(ts).toISOString(), url: safeUrl(raw.url),
    tone: S.tone(raw.title), tags: S.tags(raw.title), exDividend: S.exDividendDate(raw.title) };
}

module.exports = { search, shape, safeUrl };
