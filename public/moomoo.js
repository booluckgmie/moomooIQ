// Import positions from the local OpenD bridge. Pure logic, no DOM, no network. Browser: window.MoomooImport. Node: require().
// Read-only by design: it turns the bridge's /portfolio answer into tracker positions and a preview of what would change.
(function (root) {
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const prefixOf = (c) => { const m = /^([A-Z]{2,4})\./.exec(String(c || '').trim().toUpperCase()); return m ? m[1] : ''; };
  // "MY.0166", "0166" and "166" are the same stock
  const normCode = (c) => {
    const s = String(c || '').trim().toUpperCase().replace(/^[A-Z]{2,4}\./, '');
    return /^\d+$/.test(s) ? s.replace(/^0+/, '') || '0' : s;
  };
  const bareCode = (c) => String(c || '').trim().toUpperCase().replace(/^[A-Z]{2,4}\./, '');
  const cleanName = (n) => String(n || '').toUpperCase().replace(/[^A-Z0-9 .&-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  // Tickers must match /^[A-Z0-9.&-]{1,20}$/ everywhere else in the app (no spaces), so drop corporate words and spaces.
  const tickerFromName = (n) => String(n || '').toUpperCase().replace(/[^A-Z0-9 .&-]/g, ' ').replace(/\b(BHD|BERHAD|HOLDINGS|HLDGS?|GROUP|CORP|CORPORATION)\b/g, ' ').replace(/\s+/g, '').slice(0, 20);

  // bridge /portfolio answer -> { positions, skipped, funds }
  function parseBrokerPortfolio(data, universe = []) {
    if (!data || typeof data !== 'object') throw new Error('Unexpected answer from the bridge.');
    if (data.error) throw new Error(String(data.error));
    if (!Array.isArray(data.positions)) throw new Error('The answer has no positions list.');
    const byCode = new Map(universe.map((s) => [normCode(s.code), s]));
    const skipped = [], merged = new Map();
    for (const p of data.positions) {
      const code = String(p.code || ''), label = cleanName(p.name) || bareCode(code) || 'unknown';
      const skip = (reason) => skipped.push({ code: bareCode(code), name: label, reason });
      const pre = prefixOf(code);
      if (pre && pre !== 'MY') { skip('not a Bursa position'); continue; }
      if (/SHORT/i.test(String(p.position_type || ''))) { skip('short position'); continue; }
      const c = normCode(code);
      if (!/^[0-9A-Z]{1,6}$/.test(c)) { skip('not a plain stock code (options and similar are not tracked)'); continue; }
      const qty = Number(p.qty), cost = Number(p.average_cost), price = Number(p.nominal_price);
      if (!(qty > 0)) { skip('no shares held'); continue; }
      if (!(cost > 0)) { skip('no cost basis reported'); continue; }
      const known = byCode.get(c);
      const ticker = known ? known.ticker : (tickerFromName(p.name) || bareCode(code));
      if (!/^[A-Z0-9.&-]{1,20}$/.test(ticker)) { skip('unusable name'); continue; }
      const prev = merged.get(ticker);
      if (prev) {                                              // same stock twice: add shares, weight the cost
        const total = prev.qty + qty;
        prev.cost = r4((prev.qty * prev.cost + qty * cost) / total); prev.qty = total;
        if (!(prev.price > 0) && price > 0) prev.price = price;
      } else merged.set(ticker, { ticker, code: bareCode(code), name: label, known: !!known, qty, cost: r4(cost), price: price > 0 ? r4(price) : null });
    }
    let funds = null;
    if (data.funds && typeof data.funds === 'object' && Number.isFinite(Number(data.funds.cash))) {
      const cash = Number(data.funds.cash), frozen = Number(data.funds.frozen_cash) || 0;
      funds = { currency: String(data.funds.currency || ''), cash, frozen, free: Math.max(0, r4(cash - frozen)) };
    }
    return { positions: [...merged.values()], skipped, funds };
  }

  // existing tracker positions + imported -> the result of applying the import, and a report for the preview.
  // Existing notes (plan, trimmed, cap size, high-water mark) are kept; only shares, cost and price are refreshed.
  function mergeBrokerPositions(existing, imported, { removeMissing = false, nowMs = Date.now(), types = {} } = {}) {
    const at = new Date(nowMs).toISOString();
    const have = new Map(existing.map((p) => [p.ticker, p]));
    const seen = new Set(), added = [], updated = [], unchanged = [];
    const positions = [];
    for (const imp of imported) {
      seen.add(imp.ticker);
      const e = have.get(imp.ticker);
      const price = imp.price > 0 ? imp.price : null;
      const base = e || { ticker: imp.ticker, type: ['small', 'mid', 'large'].includes(types[imp.ticker]) ? types[imp.ticker] : 'mid', trimmed: false, plan: '' };
      const next = { ...base, qty: imp.qty, cost: imp.cost, high: Math.max(Number(base.high) || 0, imp.cost, price || 0),
        price, priceAt: price ? at : null, priceSrc: price ? 'moomoo' : null };
      if (!imp.known) next.code = imp.code;                    // lets quotes work for stocks outside the built-in list
      else delete next.code;
      positions.push(next);
      if (!e) added.push({ ticker: imp.ticker, qty: imp.qty, cost: imp.cost });
      else if (e.qty !== imp.qty || Math.abs(e.cost - imp.cost) > 1e-6)
        updated.push({ ticker: imp.ticker, qtyFrom: e.qty, qtyTo: imp.qty, costFrom: e.cost, costTo: imp.cost });
      else unchanged.push(imp.ticker);
    }
    const missing = existing.filter((p) => !seen.has(p.ticker)).map((p) => p.ticker);
    if (!removeMissing) existing.filter((p) => !seen.has(p.ticker)).forEach((p) => positions.push(p));
    return { positions, added, updated, unchanged, missing, removed: removeMissing ? missing : [] };
  }

  // Turn a failed bridge call into a plain-language next step.
  function explainBridgeError(status, body, networkError) {
    if (networkError) return 'Cannot reach the bridge on this computer. Start it with BRIDGE_TOKEN=... python3 bridge/opend_bridge.py and use Chrome or Firefox (Safari blocks this).';
    const b = body && typeof body === 'object' ? body : {};
    const d = b.detail;
    const raw = [b.error, typeof d === 'string' ? d : d && (d.error || d.output)].filter(Boolean).join(' ');
    if (status === 401) return 'The bridge token is wrong. Use the same value you started the bridge with.';
    if (/REAL disabled/i.test(raw)) return 'Real-account reads are switched off. Restart the bridge with BRIDGE_ALLOW_REAL=1 (it stays read-only).';
    if (/cannot connect to opend|connection refused|opend.*not (running|reachable)/i.test(raw)) return 'OpenD is not running or not reachable. Start OpenD, log in with your Moomoo account, then try again.';
    if (/moomoo-api not installed|no module named .?moomoo/i.test(raw)) return 'The Moomoo Python package is missing. Run: pip install moomoo-api';
    if (status === 504 || /timed out/i.test(raw)) return 'OpenD took too long to answer. Check that it is logged in, then try again.';
    if (status === 400 && b.error) return String(b.error);
    return `Moomoo answered with an error${raw ? ': ' + raw.replace(/\s+/g, ' ').slice(0, 200) : ` (${status})`}.`;
  }

  const api = { parseBrokerPortfolio, mergeBrokerPositions, explainBridgeError, normCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MoomooImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
