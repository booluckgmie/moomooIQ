// Honest history checks from daily bars. Pure maths, no I/O.
// Not a forecast: it shows how often THIS stock's own last year of prices would have hit a stop or a target.
const r3 = (n) => Math.round(n * 1000) / 1000;
const MIN_STARTS = 40;

// For every day as a hypothetical entry (at that day's close), walk forward up to `horizon` trading days and see
// which came first: the stop (low <= entry*(1-stop)) or the target (high >= entry*(1+target)). A bar that touches
// both counts as a STOP: with daily bars the order is unknowable, so assume the worse.
function replay(bars, { stop = 0.08, target = 0.2, horizon = 30 } = {}) {
  const n = bars.length, out = { target: 0, stop: 0, neither: 0 }, days = { target: [], stop: [] };
  let starts = 0;
  for (let i = 0; i + horizon < n; i++) {
    const entry = bars[i].c, s = entry * (1 - stop), t = entry * (1 + target);
    let res = 'neither', d = 0;
    for (let j = i + 1; j <= i + horizon; j++) {
      if (bars[j].l <= s) { res = 'stop'; d = j - i; break; }
      if (bars[j].h >= t) { res = 'target'; d = j - i; break; }
    }
    out[res]++; starts++;
    if (d) days[res].push(d);
  }
  if (starts < MIN_STARTS) return { ok: false, reason: 'not enough history', bars: n, starts };
  const pct = (k) => r3(out[k] / starts);
  const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  return { ok: true, starts, independent: Math.max(1, Math.floor(starts / horizon)), horizon, stop, target,
    targetPct: pct('target'), stopPct: pct('stop'), neitherPct: pct('neither'),
    medianDaysToTarget: median(days.target), medianDaysToStop: median(days.stop) };
}

// Average true range over the last `len` bars, as a share of the last close: the stock's normal daily swing.
function atrPct(bars, len = 14) {
  if (bars.length < len + 1) return null;
  let sum = 0;
  for (let i = bars.length - len; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].c;
    sum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  }
  return r3(sum / len / bars[bars.length - 1].c);
}

function summary(bars) {
  if (!bars.length) return null;
  const last = bars[bars.length - 1].c, win = bars.slice(-252);
  const back = (k) => (bars.length > k ? r3(last / bars[bars.length - 1 - k].c - 1) : null);
  return { last, high52: Math.max(...win.map((b) => b.h)), low52: Math.min(...win.map((b) => b.l)),
    chg1m: back(21), chg3m: back(63), atrPct: atrPct(bars), bars: bars.length };
}

module.exports = { replay, atrPct, summary, MIN_STARTS };
