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

test('newsForCheck: bad news, results notice and ex-dividend within 3 days; quiet entries are all null', () => {
  const entry = { items: [
    item('Sime Darby Hit With RM150.2 Mil Tax Bill', '2026-10-13T10:24:00+08:00', -2.5, { tags: ['legal'] }),
    item('INARI: Quarterly rpt for the financial period ended', '2026-10-12T20:00:00+08:00', 0, { kind: 'notice', tags: ['results'] }),
    item('INARI To Go Ex-Dividend On October 16th, 2026', '2026-10-10T01:00:00+08:00', 0, { exDividend: '2026-10-16' }),
    item('INARI To Go Ex-Dividend On October 30th, 2026', '2026-10-10T01:00:00+08:00', 0, { exDividend: '2026-10-30' })] };
  const n = T.newsForCheck(entry, NOW);
  assert.deepStrictEqual([n.bad.title, n.bad.daysAgo], ['Sime Darby Hit With RM150.2 Mil Tax Bill', 1]);
  assert.strictEqual(n.results.daysAgo, 2);
  assert.deepStrictEqual(n.exDiv, { days: 2 });                                  // 16 Oct is 2 days away; 30 Oct is outside the 3-day window
  assert.deepStrictEqual(T.newsForCheck({ items: [] }, NOW), { bad: null, results: null, exDiv: null });
  assert.deepStrictEqual(T.newsForCheck(undefined, NOW), { bad: null, results: null, exDiv: null });
});

// ---- lively / multi-level additions ----
test('greeting follows Malaysia time, not the browser clock', () => {
  const g = (iso) => T.greeting(new Date(iso)).text;
  assert.deepStrictEqual([g('2026-11-05T03:00:00+08:00'), g('2026-11-05T05:00:00+08:00'), g('2026-11-05T11:59:00+08:00'),
    g('2026-11-05T12:00:00+08:00'), g('2026-11-05T16:59:00+08:00'), g('2026-11-05T17:00:00+08:00'), g('2026-11-05T23:30:00+08:00')],
  ['Still up?', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  assert.strictEqual(T.greeting(new Date('2026-11-05T01:00:00Z')).text, 'Good morning');        // 09:00 MYT although 01:00 UTC
});

test('day progress: position on the 09:00-17:00 timeline with the lunch break marked', () => {
  const d = (iso) => T.dayProgress(new Date(iso));
  assert.deepStrictEqual([d('2026-11-04T08:00:00+08:00').phase, d('2026-11-04T08:00:00+08:00').pct], ['before', 0]);
  assert.deepStrictEqual([d('2026-11-04T09:00:00+08:00').phase, d('2026-11-04T09:00:00+08:00').pct], ['open', 0]);
  assert.deepStrictEqual([d('2026-11-04T10:30:00+08:00').phase, d('2026-11-04T10:30:00+08:00').pct], ['open', 18.75]);
  assert.strictEqual(d('2026-11-04T13:00:00+08:00').phase, 'break');
  assert.deepStrictEqual(d('2026-11-04T13:00:00+08:00').lunch, { from: 43.75, to: 68.75 });
  assert.deepStrictEqual([d('2026-11-04T17:00:00+08:00').phase, d('2026-11-04T17:00:00+08:00').pct], ['after', 100]);
  assert.deepStrictEqual([d('2026-11-07T11:00:00+08:00').phase, d('2026-11-07T11:00:00+08:00').pct], ['weekend', 0]);
});

test('tip of the day is stable within a day and rotates across days', () => {
  const tip = (iso) => T.tipOfDay(new Date(iso));
  assert.strictEqual(tip('2026-11-05T00:30:00+08:00'), tip('2026-11-05T23:30:00+08:00'));
  const seen = new Set(Array.from({ length: T.TIPS.length }, (_, i) => tip(new Date(Date.parse('2026-11-05T12:00:00+08:00') + i * 864e5).toISOString())));
  assert.strictEqual(seen.size, T.TIPS.length);                                                    // every tip appears once per cycle
  assert.ok(T.TIPS.every((x) => x.length > 30 && x.length < 160));
});

test('every item carries a plain-language explanation a beginner can read', () => {
  const stale = '2026-10-08T17:10:00+08:00';
  const pos = [{ ticker: 'INARI', qty: 200, cost: 2.12, type: 'mid', price: 1.9, high: 2.41, priceAt: '2026-11-04T17:10:00+08:00' },
    { ticker: 'GAMUDA', qty: 100, cost: 5, type: 'mid', price: 5, high: 5, priceAt: stale }];
  const r = T.buildToday({ ...base, positions: pos, portfolio: Tracker.portfolio(pos, 150) });
  const plain = (re) => r.attention.find((a) => re.test(a.title));
  assert.match(plain(/Stop hit/).plain, /INARI has fallen to your safety exit price \(RM2\.19\)\. Your plan says to sell/);
  assert.match(plain(/Update prices/).plain, /saved for these stocks are old/);
  assert.match(plain(/buffer/).plain, /very little spare cash/);
  assert.match(plain(/no written plan/).plain, /INARI is down more than 10%/);
  const opp = T.buildToday({ ...base, positions: [], portfolio: Tracker.portfolio([], 500) }).opportunities[0];
  assert.match(opp.plain, /reason to look closer, not a reason to buy/);
  const heads = T.buildToday({ ...base, positions: [], portfolio: Tracker.portfolio([], 500) }).headsUp.find((h) => /Avoid/.test(h.title));
  assert.match(heads.plain, /wait before buying/);
  // no jargon the beginner view should never show
  for (const x of [...r.attention, opp, heads]) assert.ok(!/ATR|stopWhy|trailing|\bR:R\b/i.test(x.plain || ''), x.title);
});

test('ex-dividend and results items explain what they mean', () => {
  const f = { tickers: { INARI: { items: [item('INARI To Go Ex-Dividend On October 17th, 2026', '2026-10-13T01:00:00+08:00', 0, { exDividend: '2026-10-17' }),
    item('INARI: Quarterly rpt for the financial period', '2026-10-13T20:00:00+08:00', 0, { kind: 'notice', tags: ['results'] })] } } };
  const r = T.buildToday({ now: NOW, brief: f, positions: [], portfolio: Tracker.portfolio([], 500), watch: ['INARI'] });
  assert.match(r.headsUp.find((h) => /ex-dividend/.test(h.title)).plain, /usually drops by about the dividend\. That is normal/);
  assert.match(r.headsUp.find((h) => /results announced/.test(h.title)).plain, /Prices can move sharply after results/);
});

test('position chips get a stop-to-target gauge; the summary feeds the stat tiles', () => {
  const mk = (price) => [{ ticker: 'INARI', qty: 200, cost: 2.0, type: 'mid', price, high: Math.max(2, price), priceAt: '2026-11-04T17:10:00+08:00' }];
  const chip = (price) => { const p = mk(price); return T.buildToday({ ...base, positions: p, portfolio: Tracker.portfolio(p, 600) }).chips[0]; };
  // stop = 2.00 x 0.92 = 1.84 and target = 2.00 x 1.20 = 2.40 (trailing 9% from a high of 2.00 is 1.82, lower than the initial stop)
  assert.ok(Math.abs(chip(2.0).gauge - 0.16 / 0.56) < 1e-3);        // (2.00-1.84)/(2.40-1.84) = 0.2857
  assert.strictEqual(chip(2.4).gauge, 1);                            // at the target
  assert.strictEqual(chip(1.84).gauge, 0);                           // at the stop
  assert.strictEqual(chip(1.5).gauge, 0);                            // below the stop: clamped, never negative
  assert.strictEqual(chip(3.5).gauge, 1);                            // far above the target: clamped
  // after a big run the trailing stop (9% below a 3.50 high = 3.185) sits ABOVE the 2.40 target
  const ran = (price) => { const p = [{ ticker: 'INARI', qty: 200, cost: 2.0, type: 'mid', price, high: 3.5, priceAt: '2026-11-04T17:10:00+08:00' }];
    return T.buildToday({ ...base, positions: p, portfolio: Tracker.portfolio(p, 600) }).chips[0]; };
  assert.strictEqual(ran(3.4).gauge, 1);                             // comfortably above the ratcheted stop: full bar
  assert.strictEqual(ran(3.0).gauge, 0);                             // fell back through the stop: empty bar (and a sell signal)
  assert.strictEqual(ran(3.0).state, 'sell');
  assert.strictEqual(chip(2.0).target, 2.4);
  const none = [{ ticker: 'INARI', qty: 200, cost: 2.0, type: 'mid' }];
  assert.strictEqual(T.buildToday({ ...base, positions: none, portfolio: Tracker.portfolio(none, 600) }).chips[0].gauge, null);   // no price, no gauge

  const two = [...mk(2.2), { ticker: 'GAMUDA', qty: 100, cost: 5, type: 'mid', price: 5.1, high: 5.1, priceAt: '2026-11-04T17:10:00+08:00' }];
  const sum = T.buildToday({ ...base, positions: two, portfolio: Tracker.portfolio(two, 600) }).summary;
  assert.deepStrictEqual([sum.slotsUsed, sum.maxPositions, sum.allPriced], [2, 3, true]);
  assert.strictEqual(sum.invested, 900);                             // 200 x 2.00 + 100 x 5.00 = 400 + 500 at cost
  assert.strictEqual(sum.pl, 50);                                    // 200 x (2.20-2.00) + 100 x (5.10-5.00) = 40 + 10
  const empty = T.buildToday({ ...base, positions: [], portfolio: Tracker.portfolio([], 600) }).summary;
  assert.deepStrictEqual([empty.slotsUsed, empty.allPriced, empty.needsYou], [0, false, 0]);
  const partly = [...mk(2.2), { ticker: 'SIME', qty: 100, cost: 4, type: 'large' }];
  assert.strictEqual(T.buildToday({ ...base, positions: partly, portfolio: Tracker.portfolio(partly, 600) }).summary.allPriced, false);
});
