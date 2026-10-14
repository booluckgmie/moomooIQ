const test = require('node:test');
const assert = require('node:assert');
const T = require('../public/today');
const Tracker = require('../public/tracker');

const at = (s) => new Date(s);                       // helper: ISO with explicit offset
const NOW = at('2026-10-14T10:30:00+08:00');         // Wed, morning session
const item = (title, iso, tone, extra = {}) => ({ kind: 'news', title, published: iso, url: 'https://www.moomoo.com/x', tone, tags: [], exDividend: null, ...extra });

test('market status across a Wednesday and the weekend (MYT)', () => {
  assert.deepStrictEqual([T.marketStatus(at('2026-10-14T08:00:00+08:00')).state, T.marketStatus(at('2026-10-14T08:45:00+08:00')).state], ['closed', 'pre']);
  assert.strictEqual(T.marketStatus(NOW).state, 'open');
  assert.match(T.marketStatus(NOW).detail, /ends 12:30 \(in 2h 0m\)/);
  assert.strictEqual(T.marketStatus(at('2026-10-14T13:00:00+08:00')).state, 'break');
  assert.strictEqual(T.marketStatus(at('2026-10-14T15:00:00+08:00')).state, 'open');
  assert.match(T.marketStatus(at('2026-10-14T17:30:00+08:00')).detail, /tomorrow/);
  assert.match(T.marketStatus(at('2026-10-16T17:30:00+08:00')).detail, /Monday/);          // Friday
  assert.strictEqual(T.marketStatus(at('2026-10-17T11:00:00+08:00')).state, 'weekend');
  assert.strictEqual(T.marketStatus(at('2026-10-14T00:30:00Z')).state, 'pre');              // UTC input: 00:30Z is 08:30 MYT
});

test('next check suggestion', () => {
  assert.deepStrictEqual([T.nextCheck(NOW).at, T.nextCheck(NOW).when], ['12:35', 'today']);
  assert.deepStrictEqual([T.nextCheck(at('2026-10-14T18:00:00+08:00')).at, T.nextCheck(at('2026-10-14T18:00:00+08:00')).when], ['08:45', 'tomorrow']);
  assert.strictEqual(T.nextCheck(at('2026-10-17T10:00:00+08:00')).when, 'Monday');
});

test('price freshness is relative to the last close, and skips weekends', () => {
  assert.ok(T.priceIsFresh('2026-10-13T17:10:00+08:00', NOW));       // yesterday's close is fresh on Wed morning
  assert.ok(!T.priceIsFresh('2026-10-12T17:10:00+08:00', NOW));      // Monday close is stale on Wednesday
  assert.ok(!T.priceIsFresh(null, NOW));
  const mon = at('2026-10-19T09:30:00+08:00');                        // Monday: last close = Friday 17:00
  assert.ok(T.priceIsFresh('2026-10-16T17:05:00+08:00', mon));
  assert.ok(!T.priceIsFresh('2026-10-15T17:05:00+08:00', mon));
  assert.ok(T.priceIsFresh('2026-10-14T17:05:00+08:00', at('2026-10-14T18:00:00+08:00')));  // after close: today's close
});

test('visit roll: keeps the earlier boundary within 4h, advances after a gap', () => {
  const t0 = 1_000_000_000_000, h = 36e5;
  assert.deepStrictEqual(T.rollVisit(null, t0), { since: null, at: t0 });
  assert.deepStrictEqual(T.rollVisit({ since: 5, at: t0 }, t0 + h), { since: 5, at: t0 + h });
  assert.deepStrictEqual(T.rollVisit({ since: 5, at: t0 }, t0 + 5 * h), { since: t0, at: t0 + 5 * h });
});

const feed = {
  tickers: {
    GAMUDA: { items: [item('UBS Upgrades Gamuda to Buy', '2026-10-13T09:00:00+08:00', 2, { tags: ['analyst'] })] },
    INARI: { items: [item('Macquarie Upgrades Inari', '2026-10-08T11:00:00+08:00', 2, { tags: ['analyst'] })] },
    YTLPOWR: { items: [item('YTL Power secures turbines', '2026-10-06T01:00:00+08:00', 1)] },       // too old to matter
    SIME: { items: [item('Sime Darby Hit With RM150.2 Mil Tax Bill', '2026-10-13T10:24:00+08:00', -2.5, { tags: ['legal'] })] },
    '99SMART': { items: [] },
  },
};
const base = { now: NOW, brief: feed, watch: ['GAMUDA', 'INARI', 'YTLPOWR', 'SIME', '99SMART'] };

test('opportunities: ranked by momentum, bad-news names and stale news excluded', () => {
  const r = T.buildToday({ ...base, positions: [], portfolio: Tracker.portfolio([], 500) });
  assert.deepStrictEqual(r.opportunities.map((o) => o.ticker), ['GAMUDA', 'INARI']);
  assert.ok(r.opportunities[0].score > r.opportunities[1].score);
  assert.ok(!r.opportunities.some((o) => o.ticker === 'SIME'));
  assert.ok(r.headsUp.some((h) => h.ticker === 'SIME' && /Avoid/.test(h.title)));
});

test('holding a name removes it from opportunities; bad news on a holding is flagged for action', () => {
  const pos = [{ ticker: 'SIME', qty: 100, cost: 4, type: 'large', price: 3.9, high: 4, priceAt: '2026-10-13T17:10:00+08:00' },
    { ticker: 'GAMUDA', qty: 100, cost: 5, type: 'mid', price: 5.1, high: 5.1, priceAt: '2026-10-13T17:10:00+08:00' }];
  const r = T.buildToday({ ...base, positions: pos, portfolio: Tracker.portfolio(pos, 500) });
  assert.deepStrictEqual(r.opportunities.map((o) => o.ticker), ['INARI']);
  assert.ok(r.attention.some((a) => a.ticker === 'SIME' && /Tax Bill/.test(a.title)));
  assert.ok(r.headsUp.some((h) => h.ticker === 'GAMUDA' && h.tone === 'good'));
});

test('attention: stop hit ranks first; stale prices are called out; cash buffer flagged', () => {
  const pos = [{ ticker: 'INARI', qty: 200, cost: 2.12, type: 'mid', price: 1.9, high: 2.41, priceAt: '2026-10-13T17:10:00+08:00' },
    { ticker: 'GAMUDA', qty: 100, cost: 5, type: 'mid', price: 5, high: 5, priceAt: '2026-10-08T17:10:00+08:00' }];
  const r = T.buildToday({ ...base, positions: pos, portfolio: Tracker.portfolio(pos, 150) });
  assert.match(r.attention[0].title, /Stop hit: sell INARI/);
  assert.ok(r.attention.some((a) => /Update prices: GAMUDA/.test(a.title) && !/INARI/.test(a.title)));
  assert.ok(r.attention.some((a) => /RM200 buffer/.test(a.title)));
  const noPlan = T.buildToday({ ...base, positions: pos, portfolio: Tracker.portfolio(pos, 600) }).attention.find((a) => /no written plan/.test(a.title));
  assert.match(noPlan.title, /^INARI: /);                      // ticker is in the title, not only a subtitle
});

test('calm day: nothing to act on; slots-full flag; news-missing flag when the feed is down', () => {
  const pos = [{ ticker: 'GAMUDA', qty: 100, cost: 5, type: 'mid', price: 5.2, high: 5.2, priceAt: '2026-10-13T17:10:00+08:00' }];
  const calm = T.buildToday({ now: NOW, brief: { tickers: { GAMUDA: { items: [] } } }, positions: pos, portfolio: Tracker.portfolio(pos, 600), watch: [] });
  assert.strictEqual(calm.attention.length, 0);
  assert.strictEqual(calm.slotsFull, false);
  const three = ['A', 'B', 'C'].map((t) => ({ ticker: t, qty: 100, cost: 1, type: 'mid', price: 1, high: 1, priceAt: '2026-10-13T17:10:00+08:00' }));
  assert.strictEqual(T.buildToday({ ...base, positions: three, portfolio: Tracker.portfolio(three, 600) }).slotsFull, true);
  const down = T.buildToday({ now: NOW, brief: null, positions: pos, portfolio: Tracker.portfolio(pos, 600), watch: ['GAMUDA'] });
  assert.strictEqual(down.newsMissing, true);
  assert.strictEqual(down.opportunities.length, 0);
});

test('ex-dividend within 10 days is a heads-up; past ones are not', () => {
  const f = { tickers: { INARI: { items: [item('INARI To Go Ex-Dividend On October 17th, 2026', '2026-10-13T01:00:00+08:00', 0, { exDividend: '2026-10-17' }),
    item('INARI To Go Ex-Dividend On September 17th, 2026', '2026-09-15T01:00:00+08:00', 0, { exDividend: '2026-09-17' })] } } };
  const r = T.buildToday({ now: NOW, brief: f, positions: [], portfolio: Tracker.portfolio([], 500), watch: ['INARI'] });
  assert.strictEqual(r.headsUp.length, 1);
  assert.match(r.headsUp[0].title, /ex-dividend in 3 days/);
});
