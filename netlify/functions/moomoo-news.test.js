const test = require('node:test');
const assert = require('node:assert');
const { normalize } = require('./moomoo-news');

test('normalize strips <em>, converts seconds timestamp, keeps moomoo https links', () => {
  const r = normalize({ news_id: '1', news_type: 1, title: 'A <em>GAMUDA</em> win',
    publish_time: '1791364800', url: 'https://www.moomoo.com/news/post/1?x=1&y=2' });
  assert.strictEqual(r.title, 'A GAMUDA win');
  assert.strictEqual(r.published, '2026-10-07T09:20:00.000Z');
  assert.ok(r.url.startsWith('https://www.moomoo.com/'));
});

test('normalize drops non-moomoo and javascript links', () => {
  assert.strictEqual(normalize({ title: 'x', url: 'javascript:alert(1)' }).url, '');
  assert.strictEqual(normalize({ title: 'x', url: 'https://evil.example/moomoo.com' }).url, '');
  assert.strictEqual(normalize({ title: 'x', url: 'https://notmoomoo.com/a' }).url, '');
});
