// Delayed Bursa prices and daily history from Yahoo Finance's unofficial chart endpoint (code + ".KL").
// Unofficial: it can lag, change or rate-limit, so every caller must degrade gracefully.
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (compatible; MoomooIQ/1.0)';
const TTL = { '5d': 90e3, '1y': 30 * 60e3 };
const cache = new Map();
const r3 = (n) => Math.round(n * 1000) / 1000;

const symbolFor = (stock) => (stock && /^[0-9A-Z]{3,6}$/.test(String(stock.code || '')) ? `${stock.code}.KL` : null);

// Yahoo -> { symbol, currency, price, time (ms), dayHigh, dayLow, prevClose, bars: [{day,o,h,l,c,v}] }
function parseChart(json) {
  const res = json && json.chart && json.chart.result && json.chart.result[0];
  if (!res) throw new Error((json && json.chart && json.chart.error && json.chart.error.description) || 'no chart data');
  const m = res.meta || {}, q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const bars = [], at = new Map();
  (res.timestamp || []).forEach((t, i) => {
    const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
    if (![o, h, l, c].every(Number.isFinite)) return;
    const bar = { day: new Date((t + 8 * 3600) * 1000).toISOString().slice(0, 10), o: r3(o), h: r3(h), l: r3(l), c: r3(c), v: (q.volume && q.volume[i]) || 0 };
    if (at.has(bar.day)) bars[at.get(bar.day)] = bar; else { at.set(bar.day, bars.length); bars.push(bar); }   // one bar per MYT day
  });
  const price = Number(m.regularMarketPrice), time = Number(m.regularMarketTime) * 1000;
  if (!(price > 0)) throw new Error('no price');
  const quoteDay = Number.isFinite(time) ? new Date(time + 8 * 3600e3).toISOString().slice(0, 10) : null;
  const n = bars.length;
  const prevClose = n >= 2 && bars[n - 1].day === quoteDay ? bars[n - 2].c : n ? bars[n - 1].c : null;
  return { symbol: m.symbol, currency: m.currency, price: r3(price), time: Number.isFinite(time) ? time : null,
    dayHigh: Number(m.regularMarketDayHigh) > 0 ? r3(m.regularMarketDayHigh) : null,
    dayLow: Number(m.regularMarketDayLow) > 0 ? r3(m.regularMarketDayLow) : null, prevClose, bars };
}

async function chart(symbol, range) {
  const key = `${symbol}|${range}`, hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL[range]) return hit.data;
  let last;
  for (const host of HOSTS) {                                  // try the second host if the first is limited or down
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
      const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(4500) });
      if (!res.ok) throw new Error(`Yahoo ${res.status}`);
      const data = parseChart(await res.json());
      if (cache.size > 200) cache.clear();
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) { last = e; }
  }
  throw last || new Error('Yahoo unreachable');
}

module.exports = { chart, parseChart, symbolFor, _cache: cache };
