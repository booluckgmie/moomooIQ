// Adapts the Netlify-style handlers (event -> {statusCode, headers, body}) to Vercel's (req, res).
// Files starting with "_" under api/ are not exposed as routes.
module.exports = (handler) => async (req, res) => {
  let body = '';
  if (typeof req.body === 'string') body = req.body;
  else if (req.body && typeof req.body === 'object') body = JSON.stringify(req.body);
  const event = {
    httpMethod: req.method,
    headers: req.headers || {},
    queryStringParameters: Object.fromEntries(new URL(req.url, 'http://x').searchParams),
    body,
  };
  try {
    const out = await handler(event);
    for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
    res.status(out.statusCode).send(out.body ?? '');
  } catch (e) {
    res.status(500).json({ error: 'Internal error' });
  }
};
