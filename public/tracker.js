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
        trimmed: p.trimmed === true, plan: typeof p.plan === 'string' ? p.plan.slice(0, 500) : '' };
    });
    const cash = num(d.cash);
    return { positions, cash: cash == null ? '' : String(cash) };
  }

  const api = { RULES, evaluate, portfolio, exportState, parseImport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tracker = api;
})(typeof window !== 'undefined' ? window : globalThis);
