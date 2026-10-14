const test = require('node:test');
const assert = require('node:assert');
const S = require('../lib/signals');

const st = (ticker, name) => ({ ticker, name });
const GAMUDA = st('GAMUDA', 'Gamuda'), INARI = st('INARI', 'Inari Amertron'), SIME = st('SIME', 'Sime Darby'),
  NATGATE = st('NATGATE', 'Nationgate Holdings'), PCHEM = st('PCHEM', 'Petronas Chemicals'), MAYBANK = st('MAYBANK', 'Malayan Banking'),
  SMART = st('99SMART', '99 Speed Mart');

// Real headlines pulled from the Moomoo news API.
test('tone: real positive headlines score > 0', () => {
  for (const h of ['UBS Upgrades <em>Gamuda</em> to Buy From Neutral; Price Target Is MYR6',
    'Macquarie Upgrades <em>Inari</em> Amertron to Outperform From Neutral; Price Target Is MYR3.10',
    '<em>Gamuda</em> Target Price Raised to MYR5.65 From MYR5.42 by TA Securities >5398.KU',
    'Malaysia Closing Bell on Oct 07 | <em>GAMUDA</em> Was the Top Gainer of FBM KLCI',
    '<em>NationGate</em> Climbs to Over a Year High as 2Q Beats Estimates',
    '<em>YTL Power</em> Secures Four More Siemens Gas Turbines to Meet Rising Regional Energy and AI Demand'])
    assert.ok(S.tone(h) > 0, h);
});

test('tone: real negative headlines score < 0', () => {
  for (const h of ['<em>Sime Darby</em> Hit With RM150.2 Mil Tax Bill, Plans to Appeal',
    'Kenanga Investment Bank Downgrades <em>NationGate</em> Holdings to Market Perform From Outperform',
    'Insas Plans to Sell Entire Remaining 5.65% Stake in <em>Inari</em> Amertron',
    'Genting Cut to Sell From Buy by <em>Maybank</em> IB >3182.KU'])
    assert.ok(S.tone(h) < 0, h);
});

test('tone: neutral / listicle headlines stay near zero', () => {
  assert.strictEqual(S.tone('Stocks With Momentum on Sept 30, 2026: VisDynamics, West River, <em>Gamuda</em>, Wegmans, SNS Network'), 0);
  assert.strictEqual(S.tone('<em>Gamuda</em> Land, Dusit International Officially Open 280-room ASAI <em>Gamuda</em> Cove'), 0);
  assert.ok(S.tone('Company narrows loss in 2Q') >= 0);
});

test('relevance: keeps the subject, drops other companies and broker-as-source', () => {
  assert.ok(S.relevant('<em>Gamuda</em> Target Price Raised to MYR5.65', GAMUDA));
  assert.ok(S.relevant('<em>NationGate</em> Climbs to Over a Year High', NATGATE));          // short alias of "Nationgate Holdings"
  assert.ok(S.relevant('<em>INARI</em> To Go Ex-Dividend On September 17th, 2026', INARI));    // ticker
  assert.ok(!S.relevant('Air Products and <em>Chemicals</em> To Supply Malaysia\'s First LNG-Based ASU For <em>Petronas</em>', PCHEM));
  assert.ok(S.relevant('<em>Petronas Chemicals</em>: Izwan Ismail to Take Over as Managing Director', PCHEM));
  assert.ok(!S.relevant('<em>Maybank</em> Research Downgrades Genting to Sell From Buy', MAYBANK));
  assert.ok(!S.relevant('Genting Cut to Sell From Buy by <em>Maybank</em> IB', MAYBANK));
  assert.ok(S.relevant('<em>Maybank</em> Posts Record Quarterly Profit', MAYBANK));
  assert.ok(!S.relevant('Ntt Data Intra<em>mart</em> Corp: Ito Ultra shortwave', SMART));
  assert.ok(!S.relevant('<em>Sime Darby</em> Property\'s Seroja Gardens Phase 1 Sold Out', SIME));  // different company
  assert.ok(S.relevant('<em>Sime Darby</em> Hit With RM150.2 Mil Tax Bill', SIME));
});

test('notices: keep decision-relevant, drop filing noise', () => {
  assert.ok(!S.noticeWorthKeeping("GAMUDA: Changes in Sub. S-hldr's Int (Section 138 of CA 2016) - EMPLOYEES PROVIDENT FUND BOARD"));
  assert.ok(!S.noticeWorthKeeping('INARI: Additional Listing Announcement /Subdivision of Shares'));
  assert.ok(!S.noticeWorthKeeping('GAMUDA: DEALINGS IN LISTED SECURITIES (CHAPTER 14 OF LISTING REQUIREMENTS)'));
  assert.ok(S.noticeWorthKeeping('SDG: PROPOSED DISPOSAL OF FREEHOLD LAND WITH A TOTAL LAND AREA'));
  assert.ok(S.noticeWorthKeeping('XYZ: Quarterly rpt for the financial period ended 30/09/2026 - quarterly report'));
});

test('ex-dividend date parsing', () => {
  assert.strictEqual(S.exDividendDate('<em>INARI</em> To Go Ex-Dividend On September 17th, 2026 With 0.0137 MYR Dividend Per Share'), '2026-09-17');
  assert.strictEqual(S.exDividendDate('Ex-Dividend On March 3rd, 2027'), '2027-03-03');
  assert.strictEqual(S.exDividendDate('No dividend date here'), null);
});

test('tone: market-wrap blurbs count for less than analyst calls', () => {
  assert.ok(S.tone('Malaysia Closing Bell on Oct 07 | <em>GAMUDA</em> Was the Top Gainer of FBM KLCI') < S.tone('UBS Upgrades <em>Gamuda</em> to Buy From Neutral'));
  assert.ok(S.tone('Malaysia Closing Bell | <em>GAMUDA</em> Was the Top Gainer of FBM KLCI') > 0);
});

test('tags', () => {
  assert.deepStrictEqual(S.tags('Macquarie Upgrades Inari to Outperform; Price Target Is MYR3.10'), ['analyst']);
  assert.ok(S.tags('Sime Darby Hit With RM150.2 Mil Tax Bill').includes('legal'));
});
