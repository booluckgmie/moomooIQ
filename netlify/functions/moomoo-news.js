// Moomoo news/notice/research search via the public ai-news-search API (no OpenD needed).
const BASE = 'https://ai-news-search.moomoo.com/news_search';
const TYPES = { news: 1, notice: 2, research: 3 };

const clean = (s) => String(s || '').replace(/<\/?em>/g, '');

function normalize(item) {
  const ts = Number(item.publish_time);
  let url = '';
  try {
    const u = new URL(item.url);
    if (u.protocol === 'https:' && /(^|\.)moomoo\.com$/.test(u.hostname)) url = u.href;
  } catch { /* drop unsafe/invalid links */ }
  return {
    id: item.news_id,
    type: item.news_type,
    title: clean(item.title),
    published: ts ? new Date((ts > 1e11 ? ts : ts * 1000)).toISOString() : null,
    url,
  };
}

exports.normalize = normalize;
exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const { keyword = '', type = 'news', size = '10' } = event.queryStringParameters || {};
  if (!keyword.trim() || keyword.length > 60) return json(400, { error: 'keyword required (max 60 chars)' });
  const newsType = TYPES[type] || 1;
  const n = Math.min(Math.max(parseInt(size, 10) || 10, 1), 50);

  const url = new URL(BASE);
  url.search = new URLSearchParams({
    keyword: keyword.trim(), size: String(n), news_type: String(newsType), lang: 'en', sort_type: '2',
  });
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'moomoo-news-search/0.0.2 (Skill)' },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (data.code !== 0) return json(502, { error: 'Upstream error', code: data.code });
    return json(200, {
      keyword, type, items: (data.data || []).map(normalize),
      disclaimer: 'Compiled from public information; not investment advice.',
    });
  } catch (e) {
    return json(502, { error: `News service unreachable: ${e.message}` });
  }
};
