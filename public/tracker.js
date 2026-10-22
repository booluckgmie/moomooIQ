// Portfolio rules engine (pure, no DOM). Works in browser (window.Tracker) and Node (require).
(function (root) {
  const RULES = {
    maxPositions: 3,
    initialStop: 0.08,          // stop-loss = cost x 0.92
    target: 0.20,               // minimum target = cost x 1.20
    breakevenAt: 0.10,          // +10% -> stop to breakeven
    lockProfitAt: 0.20,         // +20% -> stop to +10% above cost
    lockedProfit: 0.10,
    trimAt: 0.30,               // +30% -> trim 50%, let rest run
    maxLoss: 0.10,              // never hold -10% without a plan
    cashBuffer: 200,            // RM
    trail: { small: 0.12, mid: 0.09, large: 0.07 }, // volatile small cap / mid cap / large cap
  };
  const r3 = (n) => Math.round(n * 1000) / 1000;

  // pos: { ticker, qty, cost, type: small|mid|large, high?, price?, trimmed?, plan? }
  function evaluate(pos, rules = RULES) {
    const cost = Number(pos.cost), qty = Number(pos.qty);
    const price = pos.price == null || pos.price === '' ? null : Number(pos.price);
    const ratio = rules.trail[pos.type] ?? rules.trail.mid;
    const high = Math.max(cost, Number(pos.high) || 0, price ?? 0);   // high-water mark
    const peakGain = high / cost - 1;

    const candidates = [{ stop: cost * (1 - rules.initialStop), why: `initial -${rules.initialStop * 100}%` }];
    if (peakGain >= rules.breakevenAt) candidates.push({ stop: cost, why: 'breakeven (+10% reached)' });
    if (peakGain >= rules.lockProfitAt)
      candidates.push({ stop: cost * (1 + rules.lockedProfit), why: 'locked +10% (+20% reached)' });
    candidates.push({ stop: high * (1 - ratio), why: `trailing ${Math.round(ratio * 100)}% from high ${r3(high)}` });
    const best = candidates.reduce((a, b) => (b.stop > a.stop ? b : a));

    const out = {
      ticker: pos.ticker, qty, cost, high: r3(high), price,
      stop: r3(best.stop), stopWhy: best.why, target: r3(cost * (1 + rules.target)),
      gain: price == null ? null : r3(price / cost - 1),
      pl: price == null ? null : r3((price - cost) * qty),
      action: 'HOLD', alerts: [],
    };
    if (price == null) { out.action = 'NO PRICE'; return out; }
    if (price <= out.stop) {
      out.action = 'SELL - stop hit';
    } else if (peakGain >= rules.trimAt && !pos.trimmed) {
      out.action = 'TRIM 50%';
    } else if (price >= out.target) {
      out.action = 'HOLD - at/above target, trail the rest';
    }
    if (out.gain <= -rules.maxLoss && !String(pos.plan || '').trim())
      out.alerts.push('Down 10%+ with no written plan');
    return out;
  }

  function portfolio(positions, cash, rules = RULES) {
    const rows = positions.map((p) => evaluate(p, rules));
    const alerts = [];
    if (positions.length > rules.maxPositions)
      alerts.push(`${positions.length} positions held; max is ${rules.maxPositions}`);
    if (cash != null && cash !== '' && Number(cash) < rules.cashBuffer)
      alerts.push(`Cash RM${Number(cash)} is under the RM${rules.cashBuffer} buffer (SmartSave/RSP conflict risk)`);
    rows.forEach((r) => r.alerts.forEach((a) => alerts.push(`${r.ticker}: ${a}`)));
    const invested = rows.reduce((s, r) => s + r.cost * r.qty, 0);
    const pl = rows.reduce((s, r) => s + (r.pl || 0), 0);
    return { rows, alerts, invested: r3(invested), pl: r3(pl), plPct: invested ? r3(pl / invested) : 0 };
  }

  // Position sizing: shares such that hitting the initial stop loses at most riskPct of equity.
  // Capped by an equal-slot allocation (equity / maxPositions) and by cash above the buffer.
  function equityOf(positions, cash) {
    const held = positions.reduce((t, p) => t + (Number(p.price) > 0 ? Number(p.price) : Number(p.cost)) * Number(p.qty), 0);
    return r3(held + (Number(cash) || 0));
  }

  function sizeTrade({ equity, cash, entry, openCount = 0, riskPct = 0.02, lot = 100 }, rules = RULES) {
    entry = Number(entry); equity = Number(equity); cash = Number(cash) || 0;
    if (!(entry > 0)) return { qty: 0, reason: 'Enter a valid entry price' };
    if (!(equity > 0)) return { qty: 0, reason: 'Enter your free cash (equity is zero)' };
    if (!(riskPct > 0 && riskPct <= 0.1)) return { qty: 0, reason: 'Risk per trade must be between 0% and 10%' };
    const stop = entry * (1 - rules.initialStop);
    const perShare = entry - stop;
    const limits = [
      ['risk limit', (equity * riskPct) / perShare],
      [`1/${rules.maxPositions} allocation cap`, equity / rules.maxPositions / entry],
      [`cash (keeping RM${rules.cashBuffer} buffer)`, Math.max(0, cash - rules.cashBuffer) / entry],
    ];
    const [bound, raw] = limits.reduce((a, b) => (b[1] < a[1] ? b : a));
    const qty = Math.floor(raw / lot) * lot;
    const base = { stop: r3(stop), target: r3(entry * (1 + rules.target)), lot };
    if (openCount >= rules.maxPositions)
      return { ...base, qty: 0, reason: `Already holding ${openCount} positions (max ${rules.maxPositions}); close one first` };
    if (qty < lot)
      return { ...base, qty: 0, reason: `Not enough room for one ${lot}-share lot (limited by ${bound})` };
    return { ...base, qty, cost: r3(qty * entry), maxLoss: r3(qty * perShare),
      maxLossPct: r3((qty * perShare) / equity), pctOfEquity: r3((qty * entry) / equity), boundBy: bound };
  }

  // Pre-trade check (idea adapted from the trader-risk skill, rewritten for Bursa and this app's rules).
  // Advisory only: a PASS is "allowed to consider", never a buy signal. It cannot place or send anything.
  // news: null (unavailable) or { bad: {title, daysAgo}|null, results: {daysAgo}|null, exDiv: {days}|null }.
  function preTradeCheck({ ticker, qty, price, positions = [], cash = 0, riskPct = 0.02, news = null, lot = 100 }, rules = RULES) {
    const checks = [];
    const add = (level, text) => checks.push({ level, text });
    const q = Number(qty), px = Number(price), free = Number(cash) || 0;
    const rm = (n) => 'RM' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pc = (n) => Math.round(n * 1000) / 10 + '%';
    if (!(q > 0) || !Number.isInteger(q) || !(px > 0))
      return { verdict: 'BLOCK', checks: [{ level: 'block', text: 'Enter a whole number of shares and a price above zero.' }] };

    const equity = equityOf(positions, free), cost = q * px;
    const held = positions.find((p) => p.ticker === String(ticker).toUpperCase());
    const heldValue = held ? (Number(held.price) > 0 ? Number(held.price) : Number(held.cost)) * Number(held.qty) : 0;
    const stop = px * (1 - rules.initialStop), maxLoss = cost * rules.initialStop;

    if (held) add('pass', `Adding to an existing position (${positions.length} of ${rules.maxPositions} slots used).`);
    else if (positions.length >= rules.maxPositions) add('block', `All ${rules.maxPositions} slots are used. Close one before opening another.`);
    else add('pass', `A slot is free (${positions.length} of ${rules.maxPositions} used).`);

    const room = free - rules.cashBuffer;
    if (cost > room) add('block', `Needs ${rm(cost)} but only ${rm(Math.max(0, room))} is free after the RM${rules.cashBuffer} cash buffer.`);
    else add('pass', `Leaves ${rm(free - cost)} in cash (the RM${rules.cashBuffer} buffer is kept).`);

    const share = equity > 0 ? (heldValue + cost) / equity : Infinity, cap = 1 / rules.maxPositions;
    if (share > cap + 1e-9) add('block', `The position would be ${pc(share)} of equity; the cap is ${pc(cap)} (one third).`);
    else add('pass', `Position would be ${pc(share)} of equity (cap ${pc(cap)}).`);

    const lossShare = equity > 0 ? maxLoss / equity : Infinity;
    if (lossShare > riskPct + 1e-9) add('block', `Losing ${rm(maxLoss)} at the 8% stop is ${pc(lossShare)} of equity; your limit is ${pc(riskPct)}.`);
    else add('pass', `Max loss at the stop is ${rm(maxLoss)} (${pc(lossShare)} of equity; limit ${pc(riskPct)}).`);

    if (q % lot !== 0) add('warn', `${q} is not a multiple of ${lot}. Odd lots trade on a separate, thinner board.`);
    else add('pass', `Whole board lots of ${lot}.`);

    if (held && Number(held.price) > 0 && Number(held.price) < Number(held.cost))
      add('warn', `You would be adding to a position that is ${pc(1 - held.price / held.cost)} below your cost. Averaging down breaks "cut losers, don't add".`);

    if (news === null) add('info', 'News check unavailable right now, so check headlines yourself.');
    else {
      if (news.bad) add('warn', `Bad news ${news.bad.daysAgo}d ago: "${news.bad.title}"`);
      if (news.results) add('warn', `Results announced ${news.results.daysAgo}d ago. Earnings week means smaller size: read it first.`);
      if (news.exDiv) add('warn', `Goes ex-dividend in ${news.exDiv.days} day${news.exDiv.days === 1 ? '' : 's'}: the price drops by the dividend on that day.`);
      if (!news.bad && !news.results && !news.exDiv) add('pass', 'No bad news, results or ex-dividend in the recent window (headline check only).');
    }
    add('info', `If you go ahead: set a stop at ${rm(stop)} (8% below) the same day, and a target at ${rm(px * (1 + rules.target))}.`);

    const verdict = checks.some((c) => c.level === 'block') ? 'BLOCK' : checks.some((c) => c.level === 'warn') ? 'WARN' : 'PASS';
    return { verdict, checks, cost: r3(cost), stop: r3(stop), maxLoss: r3(maxLoss), equity: r3(equity) };
  }

  // Export / import. Import validates and keeps known fields only (file may come from anywhere).
  const TYPES = ['small', 'mid', 'large'];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  function exportState(state) {
    return JSON.stringify({ app: 'moomooiq', version: 1, exportedAt: new Date().toISOString(),
      cash: state.cash === '' || state.cash == null ? null : Number(state.cash), positions: state.positions }, null, 2);
  }

  function parseImport(text) {
    let d;
    try { d = JSON.parse(text); } catch { throw new Error('Not valid JSON'); }
    if (!d || d.app !== 'moomooiq' || !Array.isArray(d.positions)) throw new Error('Not a MoomooIQ export');
    if (d.version !== 1) throw new Error('Unsupported export version ' + d.version);
    if (d.positions.length > 50) throw new Error('Too many positions (max 50)');
    const positions = d.positions.map((p, i) => {
      const ticker = typeof p.ticker === 'string' ? p.ticker.trim().toUpperCase() : '';
      const qty = num(p.qty), cost = num(p.cost);
      if (!/^[A-Z0-9 .&-]{1,20}$/.test(ticker)) throw new Error(`Position ${i + 1}: bad ticker`);
      if (!(qty > 0) || !(cost > 0)) throw new Error(`Position ${i + 1} (${ticker}): qty and cost must be positive numbers`);
      const price = num(p.price);
      return { ticker, qty, cost, type: TYPES.includes(p.type) ? p.type : 'mid',
        high: Math.max(cost, num(p.high) || 0, price || 0), price: price > 0 ? price : null,
        priceAt: price > 0 && typeof p.priceAt === 'string' && !Number.isNaN(Date.parse(p.priceAt)) ? p.priceAt : null,
        trimmed: p.trimmed === true, plan: typeof p.plan === 'string' ? p.plan.slice(0, 500) : '' };
    });
    const cash = num(d.cash);
    return { positions, cash: cash == null ? '' : String(cash) };
  }

  const api = { RULES, evaluate, portfolio, equityOf, sizeTrade, preTradeCheck, exportState, parseImport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tracker = api;
})(typeof window !== 'undefined' ? window : globalThis);
