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

  const api = { RULES, evaluate, portfolio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tracker = api;
})(typeof window !== 'undefined' ? window : globalThis);
