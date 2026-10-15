const test = require('node:test');
const assert = require('node:assert');
const { render } = require('../public/md');

test('headings, bold, italic, code, lists, hr', () => {
  const h = render('### **1. Market Sentiment**\n\nSome *soft* and **hard** text with `code`.\n\n* one\n* two\n\n1. first\n2. second\n\n---');
  assert.match(h, /<h5>1\. Market Sentiment<\/h5>/);
  assert.match(h, /<em>soft<\/em> and <strong>hard<\/strong> text with <code>code<\/code>/);
  assert.match(h, /<ul><li[^>]*>one<\/li><li[^>]*>two<\/li><\/ul>/);
  assert.match(h, /<ol><li[^>]*>first<\/li><li[^>]*>second<\/li><\/ol>/);
  assert.match(h, /<hr>/);
});

test('tables render with header and body, inline formatting inside cells', () => {
  const h = render('| Investor | View |\n| :--- | :--- |\n| **Retail** | Mildly bearish |\n| Inst. | Buying |');
  assert.match(h, /<th>Investor<\/th><th>View<\/th>/);
  assert.match(h, /<td><strong>Retail<\/strong><\/td><td>Mildly bearish<\/td>/);
  assert.strictEqual((h.match(/<tr>/g) || []).length, 3);
});

test('fenced code is shown verbatim and escaped', () => {
  const h = render('```\n[Bear: 20%]   <b>x</b>\n```');
  assert.match(h, /<pre>\[Bear: 20%\]   &lt;b&gt;x&lt;\/b&gt;<\/pre>/);
});

test('HTML and script in model output can never execute', () => {
  const evil = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n| <b>h</b> |\n|---|\n| <i onclick=x>c</i> |\n\n**<svg onload=x>**';
  const h = render(evil);
  assert.ok(!/<script|<img|<svg|<i |<b>/.test(h), h);
  assert.match(h, /&lt;script&gt;/);
  assert.ok(!/href=/.test(h));                       // links are not rendered at all
});

test('multiplication and underscore text is not mangled; blank input is safe', () => {
  assert.match(render('R:R = 1:3.88, price 2.5 * 3 = 7.5'), /2\.5 \* 3 = 7\.5/);
  assert.strictEqual(render(''), '');
  assert.strictEqual(render(null), '');
});
