// Moomoo news proxy. OpenD speaks a local TCP protocol, so a Netlify function cannot reach it
// directly. Point OPEND_BRIDGE_URL at an HTTP bridge you run next to OpenD (GET ?keyword=&type=).
exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const bridge = process.env.OPEND_BRIDGE_URL;
  if (!bridge) {
    return json(503, {
      error: 'OpenD bridge not configured',
      hint: 'Run OpenD locally and use the Claude Code moomoo-news-search skill, or set OPEND_BRIDGE_URL.',
    });
  }
  const { keyword = '', type = '' } = event.queryStringParameters || {};
  if (!keyword) return json(400, { error: 'keyword required' });
  try {
    const url = new URL(bridge);
    url.searchParams.set('keyword', keyword);
    if (type) url.searchParams.set('type', type);
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return json(res.status, await res.json());
  } catch (e) {
    return json(502, { error: `Bridge unreachable: ${e.message}` });
  }
};
