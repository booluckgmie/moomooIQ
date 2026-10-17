// Aggregated Vercel Web Analytics for this project: GET /api/analytics -> page views, visitors, daily series,
// top pages, countries, devices, referrers. Needs VERCEL_ANALYTICS_TOKEN (a Vercel access token that can read
// this project); without it, answers { connected: false, reason } so the frontend shows setup instructions
// instead of numbers. Aggregates only, no visitor-level data. On Netlify this always answers connected:false
// (no_project), since the site isn't a Vercel project there — the frontend's fallback copy covers that too.
// Optional env: VERCEL_ANALYTICS_PROJECT_ID (default VERCEL_PROJECT_ID), VERCEL_ANALYTICS_TEAM_ID
// (default VERCEL_TEAM_ID), ANALYTICS_DAYS (default 30, clamped 7-90).
const API = 'https://api.vercel.com/v1/query/web-analytics/visits/aggregate';
const DIMS = [['pages', 'requestPath'], ['countries', 'country'], ['devices', 'deviceType'], ['referrers', 'referrerHostname']];

function readRows(json, dim) {
  const rows = Array.isArray(json) ? json : (json && (json.data || json.rows || json.results)) || [];
  return rows.map((r) => ({
    key: String(r.key ?? r[dim] ?? r.name ?? r.label ?? ''),
    views: Number(r.total ?? r.count ?? r.pageviews ?? r.views ?? r.visits ?? 0) || 0,
    visitors: Number(r.devices ?? r.visitors ?? r.uniques ?? 0) || 0,
  })).filter((r) => r.key !== '');
}

async function query(by, o) {
  const u = new URL(API);
  u.searchParams.set('projectId', o.projectId);
  if (o.teamId) u.searchParams.set('teamId', o.teamId);
  for (const b of by) u.searchParams.append('by', b);
  u.searchParams.set('since', new Date(o.since).toISOString());
  u.searchParams.set('until', new Date(o.until).toISOString());
  u.searchParams.set('limit', '10');
  const res = await fetch(u, { headers: { authorization: `Bearer ${o.token}`, accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Vercel API ${res.status}`);
  return res.json();
}

exports.readRows = readRows;
exports.handler = async (event) => {
  const json = (statusCode, body, cache) => ({ statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': cache || 'public, max-age=0, s-maxage=300, stale-while-revalidate=900' },
    body: JSON.stringify(body) });
  if (event.httpMethod && !['GET', 'HEAD'].includes(event.httpMethod)) return json(405, { error: 'GET only' }, 'no-store');

  const env = process.env;
  const token = env.VERCEL_ANALYTICS_TOKEN;
  const projectId = env.VERCEL_ANALYTICS_PROJECT_ID || env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return json(200, { connected: false, reason: !token ? 'no_token' : 'no_project' }, 'public, max-age=0, s-maxage=60');

  const days = Math.min(90, Math.max(7, parseInt(env.ANALYTICS_DAYS, 10) || 30));
  const now = Date.now();
  const o = { token, projectId, teamId: env.VERCEL_ANALYTICS_TEAM_ID || env.VERCEL_TEAM_ID, until: now, since: now - days * 864e5 };

  try {
    const [daily, ...rest] = await Promise.all([query(['day'], o), ...DIMS.map(([, d]) => query([d], o))]);
    const out = { connected: true, days, since: new Date(o.since).toISOString().slice(0, 10), until: new Date(o.until).toISOString().slice(0, 10),
      daily: readRows(daily, 'day') };
    DIMS.forEach(([name, d], i) => { out[name] = readRows(rest[i], d); });
    out.totals = { views: out.daily.reduce((a, r) => a + r.views, 0), visitors: out.daily.reduce((a, r) => a + r.visitors, 0) };
    return json(200, out);
  } catch (e) {
    return json(200, { connected: false, reason: 'api_error', detail: String((e && e.message) || e).slice(0, 120) }, 'public, max-age=0, s-maxage=30');
  }
};
