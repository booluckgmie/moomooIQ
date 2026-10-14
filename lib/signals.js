// Headline relevance + tone for Moomoo news/notices. Pure, no I/O.
// Keyword-based on purpose: cheap, free, explainable. Not a price or valuation signal.

const SUFFIX = /\b(holdings?|berhad|bhd|group|corporation|corp|international|resources|company)\b/g;
// Search keyword / alias overrides where the company name is not how headlines write it.
const KEYWORD = { INARI: 'Inari', NATGATE: 'Nationgate', '99SMART': '99 Speed Mart', PCHEM: 'Petronas Chemicals',
  MRDIY: 'MR D.I.Y.', SUPERMX: 'Supermax', HARTA: 'Hartalega', TENAGA: 'Tenaga Nasional', GREATEC: 'Greatech' };
const EXTRA_ALIASES = { SIME: ['sime darby'], '99SMART': ['99smart', '99 speed mart'], MRDIY: ['mr d.i.y', 'mr diy'],
  DNEX: ['dnex', 'dagang nexchange'], PCHEM: ['petronas chemicals', 'pchem'] };
// Different companies that share a name prefix.
const EXCLUDE = { SIME: /sime darby (property|plantation)|simeprop|simeplt/i, YTL: /ytl power|ytlpowr/i };
// Research houses: headlines name them as the *source* of a rating on another stock.
const BROKERS = new Set(['MAYBANK', 'CIMB', 'RHBBANK', 'HLBANK', 'PBBANK']);
const BROKER_AS_SOURCE = /<em>[^<]*<\/em>[^<]{0,25}(upgrades?|downgrades?|starts?|initiates?|cuts?|raises?|lifts?|reiterates?|maintains?|keeps?|sets?)\b|\b(by|from)\s+<em>/i;

const strip = (t) => String(t || '').replace(/<\/?em>/g, '').replace(/\s+/g, ' ').trim();

function aliases(stock) {
  const t = String(stock.ticker).toUpperCase();
  const name = String(stock.name || '').toLowerCase();
  const out = new Set([t.toLowerCase(), name, name.replace(SUFFIX, '').replace(/\s+/g, ' ').trim()]);
  if (KEYWORD[t]) out.add(KEYWORD[t].toLowerCase());
  (EXTRA_ALIASES[t] || []).forEach((a) => out.add(a));
  out.delete('');
  return [...out];
}
const keywordFor = (stock) => KEYWORD[stock.ticker] || stock.name || stock.ticker;

// Is this headline actually about the stock (not another company, not the stock acting as a broker)?
function relevant(rawTitle, stock) {
  const plain = strip(rawTitle).toLowerCase();
  const t = String(stock.ticker).toUpperCase();
  if (EXCLUDE[t] && EXCLUDE[t].test(plain)) return false;
  if (BROKERS.has(t) && BROKER_AS_SOURCE.test(String(rawTitle))) return false;
  return aliases(stock).some((a) => plain.includes(a));
}

const RULES = [ // [regex, weight]; weights add up, result clamped to +-3
  [/\bupgrades?\b/, 2], [/target price (is )?raised|raises?[^|]{0,30}target|lifts?[^|]{0,30}target/, 1.5],
  [/top gainer/, 0.5],
  [/\bclimbs?\b|\brall(y|ies)\b|\bsurges?\b|\bjumps?\b|\bsoars?\b|year high|record (high|profit|revenue|order)|\bbeats?\b|stronger|\bsecures?\b|\bbags?\b|\bwins?\b|awarded|sold out|worth accumulating|constructive|set to gain/, 1],
  [/downgrades?|cut to (sell|hold)/, -2], [/target price cut|cuts?[^|]{0,30}target|lowers?[^|]{0,30}target/, -1.5],
  [/tax bill|\bprobe\b|investigat|penalt|\bfined?\b|fraud|\bdefault|winding|pn17|delist|suspend|warns?\b|profit warning|\bmisses?\b|\bresigns?\b|unusual market activity/, -1.5],
  [/top loser/, -0.5], [/\bplung|\btumbl|\bslump|\bfalls?\b|\bdrops?\b|plans? (to )?(sell|dispose)|sale of [^|]{0,30}stake|stake sale|hit with/, -1],
  [/\b(net )?loss(es)?\b/, -1],
];
const NARROW = /narrow(s|ed)?\b[^|]{0,15}loss/;

function listicle(plain) { return (plain.match(/,/g) || []).length >= 3; }

function tone(rawTitle) {
  const plain = strip(rawTitle).toLowerCase();
  if (listicle(plain)) return 0;                     // "Stocks with momentum: A, B, C, ..." says little about one name
  let s = 0;
  for (const [re, w] of RULES) if (re.test(plain)) s += w;
  if (NARROW.test(plain)) s = Math.max(s, 0.5);
  return Math.max(-3, Math.min(3, s));
}

function tags(rawTitle) {
  const p = strip(rawTitle).toLowerCase();
  const out = [];
  if (/earnings|quarter|financial results|unaudited|annual report|profit/.test(p)) out.push('results');
  if (/dividend|entitlement/.test(p)) out.push('dividend');
  if (/contract|secures|bags|awarded|joint venture|acquisition|disposal/.test(p)) out.push('deal');
  if (/upgrade|downgrade|target price|price target|initiat/.test(p)) out.push('analyst');
  if (/probe|investigat|penalt|tax bill|fraud|winding|default|pn17|delist|suspend|query|unusual market activity/.test(p)) out.push('legal');
  if (/stake|placement/.test(p)) out.push('stake');
  return out;
}

// Exchange notices are mostly noise (EPF Section 138 filings, dealings, listing admin). Keep the ones that move decisions.
const NOTICE_KEEP = /quarterly (report|results)|financial results|unaudited|annual report|dividend|entitlement|proposed|acquisition|disposal|contract|award|joint venture|placement|rights issue|bonus issue|buy-?back|unusual market activity|\bquery\b|default|winding|pn17|delist|suspension|material litigation|profit (warning|guidance)|resign/i;
const noticeWorthKeeping = (rawTitle) => NOTICE_KEEP.test(strip(rawTitle));

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// "... To Go Ex-Dividend On September 17th, 2026 ..." -> "2026-09-17"
function exDividendDate(rawTitle) {
  const m = /ex-dividend on ([a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})/i.exec(strip(rawTitle));
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

module.exports = { strip, aliases, keywordFor, relevant, tone, tags, noticeWorthKeeping, exDividendDate };
