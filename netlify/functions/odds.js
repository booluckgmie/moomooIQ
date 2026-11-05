// History check for one stock: how often its own last year of daily bars hit your stop vs your target.
// GET ?ticker=INARI&stop=0.08&target=0.2&horizon=30. A reality check, not a forecast.
const P = require('../../lib/prices');
const O = require('../../lib/odds');
const { flat } = require('./stocks');

const num = (v, def, lo, hi) => { const n = v === undefined || v === '' ? def : Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

exports.handler = async (event) => {
  const json = (statusCode, body, cache) => ({ statusCode,
    headers: { 'content-type': 'application/json', ...(cache ? { 'cache-control': cache } : {}) }, body: JSON.stringify(body) });
  const q = event.queryStringParameters || {};
  const ticker = String(q.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9.&-]{1,20}$/.test(ticker)) return json(400, { error: 'ticker required' });
  const stop = num(q.stop, 0.08, 0.02, 0.25), target = num(q.target, 0.2, 0.05, 1), horizon = num(q.horizon, 30, 5, 60);
  if (stop === null || target === null || horizon === null) return json(400, { error: 'stop 0.02-0.25, target 0.05-1, horizon 5-60' });

  const stock = flat().find((s) => s.ticker === ticker), sym = P.symbolFor(stock);
  if (!sym) return json(404, { error: `${ticker} is not in the stock list` });
  try {
    const c = await P.chart(sym, '1y');
    return json(200, { ticker, symbol: sym, price: c.price, quoteTime: c.time ? new Date(c.time).toISOString() : null,
      asOf: c.bars.length ? c.bars[c.bars.length - 1].day : null, summary: O.summary(c.bars),
      odds: O.replay(c.bars, { stop, target, horizon }), source: 'Yahoo Finance daily bars (delayed)' },
      'public, s-maxage=1800, stale-while-revalidate=3600');
  } catch (e) {
    return json(502, { error: 'Price history unavailable right now' });
  }
};
