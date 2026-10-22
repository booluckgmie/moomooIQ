// "Today" briefing logic (pure, no DOM). Browser: window.Today. Node: require().
(function (root) {
  const H = 36e5, D = 864e5;
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
  const MIN_OPP_SCORE = 0.6;

  // Malaysia time is UTC+8 with no DST.
  function myt(now) {
    const t = new Date(now.getTime() + 8 * H);
    return { dow: t.getUTCDay(), mins: t.getUTCHours() * 60 + t.getUTCMinutes(),
      dayMs: Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) };
  }

  // Bursa sessions. Public holidays are not known here.
  function marketStatus(now) {
    const { dow, mins } = myt(now);
    if (dow === 0 || dow === 6) return { state: 'weekend', label: 'Closed', detail: 'Weekend · reopens Monday 09:00' };
    const seg = [[510, 540, 'pre', 'Pre-open', 'opens 09:00'], [540, 750, 'open', 'Open', 'morning session ends 12:30'],
      [750, 870, 'break', 'Lunch break', 'reopens 14:30'], [870, 1020, 'open', 'Open', 'closes 17:00']];
    for (const [a, b, state, label, txt] of seg) if (mins >= a && mins < b) return { state, label, detail: `${txt} (in ${dur(b - mins)})` };
    if (mins < 510) return { state: 'closed', label: 'Closed', detail: `pre-open 08:30 (in ${dur(510 - mins)})` };
    return { state: 'closed', label: 'Closed', detail: dow === 5 ? 'reopens Monday 09:00' : 'reopens tomorrow 09:00' };
  }

  const CHECKS = [[525, 'Overnight news and notices'], [755, 'Midday: check your stops'], [1030, 'After close: plan tomorrow']];
  function nextCheck(now) {
    const { dow, mins } = myt(now);
    const weekday = dow >= 1 && dow <= 5;
    if (weekday) { const c = CHECKS.find(([m]) => m > mins); if (c) return { at: hm(c[0]), why: c[1], when: 'today' }; }
    const day = dow === 5 || dow === 6 || dow === 0 ? 'Monday' : 'tomorrow';
    return { at: hm(CHECKS[0][0]), why: CHECKS[0][1], when: day };
  }

  // Last weekday 17:00 MYT that has already passed, as epoch ms.
  function lastClose(now) {
    const { dow, mins, dayMs } = myt(now);
    let d = dayMs - ((dow >= 1 && dow <= 5 && mins >= 1020) ? 0 : 1) * D;
    while ([0, 6].includes(new Date(d).getUTCDay())) d -= D;
    return d + 9 * H;                                   // 17:00 MYT = 09:00 UTC
  }
  const startOfDay = (now) => myt(now).dayMs - 8 * H;
  const priceIsFresh = (priceAt, now) => !!priceAt && Date.parse(priceAt) >= lastClose(now) - H;

  function rollVisit(stored, nowMs, gapHours = 4) {
    if (!stored || !stored.at) return { since: null, at: nowMs };
    return { since: nowMs - stored.at > gapHours * H ? stored.at : stored.since || null, at: nowMs };
  }

  const ageH = (iso, now) => (now.getTime() - Date.parse(iso)) / H;
  function timeAgo(iso, now) {
    const h = ageH(iso, now);
    if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
    return h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
  }
  const weight = (h) => (h <= 24 ? 1 : h <= 72 ? 0.7 : h <= 168 ? 0.4 : h <= 336 ? 0.15 : 0);
  const dots = (s) => (s >= 2.5 ? 3 : s >= 1.2 ? 2 : 1);

  // Headline momentum for one ticker: recency-weighted sum of tones, plus the standout items.
  function analyse(entry, now) {
    let score = 0; const bad = []; let best = null;
    for (const it of (entry && entry.items) || []) {
      const h = ageH(it.published, now), w = weight(h);
      if (!w) continue;
      score += it.tone * w;
      if (it.tone <= -1.5 && h <= 168) bad.push(it);
      if (it.tone >= 1 && (!best || it.tone * w > best.s)) best = { it, s: it.tone * w };
    }
    bad.sort((a, b) => b.published.localeCompare(a.published));
    return { score: Math.max(-6, Math.min(6, score)), bad, best: best && best.it };
  }

  // Summarise one ticker's headlines for the pre-trade check. entry undefined => nothing found (not "unavailable").
  function newsForCheck(entry, now) {
    const items = (entry && entry.items) || [], today0 = startOfDay(now);
    const days = (iso) => Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / D));
    const bad = analyse(entry, now).bad[0];
    const res = items.find((i) => i.kind === 'notice' && i.tags.includes('results') && ageH(i.published, now) <= 72);
    let exDiv = null;
    for (const i of items) {
      if (!i.exDividend) continue;
      const n = Math.round((Date.parse(`${i.exDividend}T00:00:00+08:00`) - today0) / D);
      if (n >= 0 && n <= 3 && (!exDiv || n < exDiv.days)) exDiv = { days: n };
    }
    return { bad: bad ? { title: bad.title, daysAgo: days(bad.published) } : null, results: res ? { daysAgo: days(res.published) } : null, exDiv };
  }

  const money = (n) => `RM${Number(n).toFixed(2)}`;

  function buildToday({ now, brief, positions = [], portfolio, watch = [], maxPositions = 3, sinceVisit = null }) {
    const held = new Set(positions.map((p) => p.ticker));
    const feed = (brief && brief.tickers) || {};
    const isNew = (iso) => !!sinceVisit && Date.parse(iso) > sinceVisit;
    const attention = [], headsUp = [], opportunities = [];

    // 1. Your own rules
    if (portfolio) {
      portfolio.rows.forEach((r) => {
        if (/SELL/.test(r.action)) attention.push({ sev: 3, tone: 'bad', ticker: r.ticker, go: 'portfolio',
          title: `Stop hit: sell ${r.ticker}`, sub: `${money(r.price)} is at or below your stop ${money(r.stop)} (${r.stopWhy})` });
        else if (/TRIM/.test(r.action)) attention.push({ sev: 2, tone: 'good', ticker: r.ticker, go: 'portfolio',
          title: `Trim half of ${r.ticker}`, sub: 'It reached +30%: take 50% off and let the rest run with the stop' });
      });
      portfolio.alerts.forEach((a) => {
        const m = /^([A-Z0-9&.-]+): (.*)$/.exec(a);
        attention.push({ sev: m ? 2 : 1, tone: 'bad', ticker: m ? m[1] : '', go: 'portfolio', title: a, sub: m ? 'Your portfolio rule' : 'Portfolio rule' });
      });
      const stale = positions.filter((p) => !(Number(p.price) > 0) || !priceIsFresh(p.priceAt, now)).map((p) => p.ticker);
      if (stale.length) attention.push({ sev: 2, tone: 'bad', ticker: '', go: 'portfolio',
        title: `Update prices: ${stale.join(', ')}`, sub: 'Stops are only checked against prices you have entered, and these are out of date' });
    }

    // 2. Bad news on what you hold
    held.forEach((t) => {
      const a = analyse(feed[t], now);
      if (a.bad.length) attention.push({ sev: 2, tone: 'bad', ticker: t, url: a.bad[0].url, published: a.bad[0].published,
        title: a.bad[0].title, sub: `${t} · bad news ${timeAgo(a.bad[0].published, now)}`, isNew: isNew(a.bad[0].published) });
    });

    // 3. Best opportunities: watchlist names (not already held) with positive, uncontested headline momentum
    watch.filter((t) => !held.has(t)).forEach((t) => {
      const a = analyse(feed[t], now);
      if (a.score >= MIN_OPP_SCORE && !a.bad.length && a.best)
        opportunities.push({ ticker: t, score: a.score, dots: dots(a.score), title: a.best.title, url: a.best.url,
          published: a.best.published, sub: timeAgo(a.best.published, now), isNew: isNew(a.best.published) });
    });
    opportunities.sort((x, y) => y.score - x.score || y.published.localeCompare(x.published));

    // 4. Heads-up: events worth knowing, not acting on
    const today0 = startOfDay(now), seenEx = new Set();
    new Set([...held, ...watch]).forEach((t) => {
      const e = feed[t]; if (!e) return;
      const isHeld = held.has(t), a = analyse(e, now);
      e.items.forEach((it) => {
        if (it.exDividend) {
          const d = Date.parse(`${it.exDividend}T00:00:00+08:00`), k = `${t}${it.exDividend}`;
          if (d >= today0 && d <= today0 + 10 * D && !seenEx.has(k)) {
            seenEx.add(k);
            const n = Math.round((d - today0) / D);
            headsUp.push({ sev: isHeld ? 2 : 1, tone: 'info', ticker: t, url: it.url, published: it.published,
              title: `${t} goes ex-dividend ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`, sub: it.exDividend });
          }
        }
        const h = ageH(it.published, now);
        if (it.kind === 'notice' && it.tags.includes('results') && h <= 72)
          headsUp.push({ sev: isHeld ? 2 : 1, tone: 'info', ticker: t, url: it.url, published: it.published,
            title: `${t}: results announced`, sub: `Read before trading · ${timeAgo(it.published, now)}` });
        if (isHeld && it.tags.includes('analyst') && h <= 72 && it.tone > 0)
          headsUp.push({ sev: 2, tone: 'good', ticker: t, url: it.url, published: it.published, title: it.title, sub: `${t} · analyst · ${timeAgo(it.published, now)}` });
      });
      if (!isHeld && a.bad.length)
        headsUp.push({ sev: 1, tone: 'bad', ticker: t, url: a.bad[0].url, published: a.bad[0].published,
          title: `Avoid for now: ${t}`, sub: a.bad[0].title });
    });

    const byNewest = (x, y) => (y.sev - x.sev) || String(y.published || '').localeCompare(String(x.published || ''));
    attention.sort(byNewest); headsUp.sort(byNewest);

    // Compact position chips
    const chips = (portfolio ? portfolio.rows : []).map((r) => ({
      ticker: r.ticker, gain: r.gain, stop: r.stop, price: r.price,
      room: r.price > 0 ? (r.price - r.stop) / r.price : null,
      state: /SELL/.test(r.action) ? 'sell' : /TRIM/.test(r.action) ? 'trim' : r.price == null ? 'noprice' : 'ok' }));

    return { attention: attention.slice(0, 6), opportunities: opportunities.slice(0, 3), headsUp: headsUp.slice(0, 5), chips,
      slotsFull: positions.length >= maxPositions, newsMissing: !brief };
  }

  const api = { marketStatus, nextCheck, lastClose, priceIsFresh, rollVisit, timeAgo, analyse, buildToday, newsForCheck, weight, dots, MIN_OPP_SCORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Today = api;
})(typeof window !== 'undefined' ? window : globalThis);
