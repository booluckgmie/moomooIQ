const test = require('node:test');
const assert = require('node:assert');
const analytics = require('./analytics');

const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; delete process.env.VERCEL_ANALYTICS_TOKEN; delete process.env.VERCEL_ANALYTICS_PROJECT_ID;
  delete process.env.VERCEL_PROJECT_ID; delete process.env.VERCEL_ANALYTICS_TEAM_ID; delete process.env.ANALYTICS_DAYS; });

const call = (method = 'GET') => analytics.handler({ httpMethod: method });
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('readRows normalises several upstream shapes and drops empty keys', () => {
  assert.deepStrictEqual(analytics.readRows([{ key: '/today', total: 5, devices: 2 }], 'requestPath'),
    [{ key: '/today', views: 5, visitors: 2 }]);
  assert.deepStrictEqual(analytics.readRows({ data: [{ country: 'MY', count: 3 }] }, 'country'),
    [{ key: 'MY', views: 3, visitors: 0 }]);
  assert.deepStrictEqual(analytics.readRows([{ key: '', total: 1 }], 'day'), []);
});

test('answers connected:false with no_token when VERCEL_ANALYTICS_TOKEN is missing', async () => {
  const r = await call();
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(r.body), { connected: false, reason: 'no_token' });
});

test('answers connected:false with no_project when the token is set but no project id is available (e.g. Netlify)', async () => {
  process.env.VERCEL_ANALYTICS_TOKEN = 'tok';
  const r = await call();
  assert.deepStrictEqual(JSON.parse(r.body), { connected: false, reason: 'no_project' });
});

test('rejects non-GET methods', async () => {
  const r = await call('POST');
  assert.strictEqual(r.statusCode, 405);
});

test('aggregates daily views/visitors, dimension breakdowns and totals when configured', async () => {
  process.env.VERCEL_ANALYTICS_TOKEN = 'tok'; process.env.VERCEL_PROJECT_ID = 'prj_1'; process.env.ANALYTICS_DAYS = '14';
  const byDim = {
    day: [{ key: '2026-10-16', total: 10, devices: 4 }, { key: '2026-10-17', total: 20, devices: 6 }],
    requestPath: [{ key: '/', total: 25, devices: 9 }],
    country: [{ key: 'MY', total: 30, devices: 10 }],
    deviceType: [{ key: 'mobile', total: 18, devices: 7 }],
    referrerHostname: [{ key: 'google.com', total: 5, devices: 2 }],
  };
  global.fetch = async (url) => {
    const u = new URL(String(url));
    assert.strictEqual(u.searchParams.get('projectId'), 'prj_1');
    const by = u.searchParams.get('by');
    return reply(200, byDim[by]);
  };
  const r = await call();
  const d = JSON.parse(r.body);
  assert.strictEqual(d.connected, true);
  assert.strictEqual(d.days, 14);
  assert.strictEqual(d.totals.views, 30);
  assert.strictEqual(d.totals.visitors, 10);
  assert.deepStrictEqual(d.pages, [{ key: '/', views: 25, visitors: 9 }]);
  assert.deepStrictEqual(d.countries, [{ key: 'MY', views: 30, visitors: 10 }]);
  assert.deepStrictEqual(d.devices, [{ key: 'mobile', views: 18, visitors: 7 }]);
  assert.deepStrictEqual(d.referrers, [{ key: 'google.com', views: 5, visitors: 2 }]);
});

test('includes the team id when VERCEL_TEAM_ID is set', async () => {
  process.env.VERCEL_ANALYTICS_TOKEN = 'tok'; process.env.VERCEL_PROJECT_ID = 'prj_1'; process.env.VERCEL_ANALYTICS_TEAM_ID = 'team_1';
  let seenTeam;
  global.fetch = async (url) => { seenTeam = new URL(String(url)).searchParams.get('teamId'); return reply(200, []); };
  await call();
  assert.strictEqual(seenTeam, 'team_1');
});

test('a failed upstream call degrades to connected:false with reason api_error, never 500s', async () => {
  process.env.VERCEL_ANALYTICS_TOKEN = 'tok'; process.env.VERCEL_PROJECT_ID = 'prj_1';
  global.fetch = async () => reply(500, {});
  const r = await call();
  assert.strictEqual(r.statusCode, 200);
  const d = JSON.parse(r.body);
  assert.strictEqual(d.connected, false);
  assert.strictEqual(d.reason, 'api_error');
});
