// Growth: invites, points/levels/badges, leaderboard, smart links, campaigns, SEO pages, Content Studio.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'query-growth-'));
Object.assign(process.env, { DB_FILE: path.join(tmp, 'test.db'), DISABLE_PUSH: '1', AUTH_RATE_LIMIT: '1000', ADMIN_EMAILS: 'admin@test.io',
  IOS_STORE_URL: 'https://apps.apple.com/app/id123', ANDROID_STORE_URL: 'https://play.google.com/store/apps/details?id=com.query.app', FB_PAGE_ID: 'PAGE1', FB_PAGE_TOKEN: 'T', IG_USER_ID: 'IG1' });

let base; let server; let graph; const calls = [];
test.before(async () => {
  graph = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    calls.push({ path: req.url.split('?')[0], body: b }); res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.startsWith('/IG1/media_publish') ? { id: 'ig-9' } : req.url.startsWith('/IG1/media') ? { id: 'c-1' } : { id: 'photo-1', post_id: 'PAGE1_1' }));
  }); });
  await new Promise((r) => graph.listen(0, r));
  process.env.META_GRAPH_URL = `http://127.0.0.1:${graph.address().port}`;
  require('../src/seed').ensureCategories();
  server = http.createServer(require('../src/app').createApp({ uploadDir: path.join(tmp, 'uploads') }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); graph.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function api(method, p, { token, json, form, headers = {} } = {}) {
  const h = { ...headers }; if (token) h.Authorization = `Bearer ${token}`;
  let body; if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); } if (form) body = form;
  const res = await fetch(base + p, { method, headers: h, body, redirect: 'manual' });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const register = async (name, email, extra = {}) => (await api('POST', '/api/auth/register', { json: { name, email, password: 'secret123', ...extra } })).data;
let cats; let A; let ADMIN;

test('renamed categories', async () => {
  cats = (await api('GET', '/api/categories')).data;
  const name = (k) => cats.find((c) => c.key === k);
  assert.equal(name('sports').nameAr, 'الرياضة والتغذية'); assert.equal(name('sports').nameEn, 'Sports & Nutrition');
  assert.equal(name('cars').nameAr, 'السيارات والصيانة'); assert.equal(name('realestate').nameAr, 'العقار والإيجار');
  assert.equal(name('money').nameAr, 'وظائف وأعمال ومال'); assert.equal(name('health').nameAr, 'الطب والصحة');
  assert.equal(name('law').nameAr, 'القانون والاستشارات'); assert.equal(name('gov').nameAr, 'الخدمات الحكومية');
  assert.equal(name('marketing').nameAr, 'الدعاية والإعلان'); assert.equal(name('education').nameAr, 'التعليم والدراسة');
  assert.equal(name('tech').nameAr, 'التقنية والبرمجة'); assert.equal(name('hobbies').nameTr, 'Hobiler & Eğlence');
  assert.equal(cats.length, 17); assert.deepEqual(cats.slice(-3).map((c) => c.key), ['reviews', 'lostfound', 'general']);
});

test('invites: code, landing page, credit + notification, points', async () => {
  A = await register('Sara', 'sara@test.io');
  const g = (await api('GET', '/api/me/growth', { token: A.token })).data;
  assert.match(g.inviteCode, /^[A-Z0-9]{6}$/); assert.ok(g.inviteLink.endsWith(`/i/${g.inviteCode}`));
  const page = await (await fetch(`${base}/i/${g.inviteCode}?lang=ar`)).text();
  assert.ok(page.includes('Sara يدعوك إلى Query') && page.includes(g.inviteCode) && page.includes('og:title'));
  await register('Friend One', 'f1@test.io', { inviteCode: g.inviteCode.toLowerCase() });
  await register('Friend Two', 'f2@test.io', { inviteCode: g.inviteCode });
  await register('Friend Three', 'f3@test.io', { inviteCode: g.inviteCode });
  const after = (await api('GET', '/api/me/growth', { token: A.token })).data;
  assert.equal(after.invites, 3); assert.equal(after.points, 60); assert.ok(after.badges.includes('ambassador'));
  const notes = (await api('GET', '/api/notifications', { token: A.token })).data.items;
  assert.ok(notes.some((n) => n.type === 'invited' && n.text.includes('Friend')));
  const selfish = await register('Nobody', 'n@test.io', { inviteCode: 'ZZZZZZ' });
  assert.ok(selfish.token, 'unknown codes are ignored, sign-up still works');
});

test('points, levels, badges and the weekly leaderboard', async () => {
  const B = await register('Bushra', 'b@test.io');
  const q = (await api('POST', '/api/posts', { token: A.token, json: { categoryId: cats[16].id, type: 'TEXT', content: 'Best coffee shop in Riyadh?' } })).data;
  const ans = (await api('POST', `/api/posts/${q.id}/comments`, { token: B.token, json: { content: 'Try Brew92 in Olaya' } })).data;
  await api('POST', `/api/posts/${q.id}/best`, { token: A.token, json: { commentId: ans.id } });
  await api('POST', `/api/posts/${q.id}/like`, { token: B.token });
  const gb = (await api('GET', '/api/me/growth', { token: B.token })).data;
  assert.equal(gb.points, 5 + 15); assert.deepEqual(gb.badges, ['firstAnswer', 'bestAnswer']); assert.equal(gb.level.key, 'beginner');
  const ga = (await api('GET', '/api/me/growth', { token: A.token })).data;
  assert.equal(ga.points, 60 + 2 + 1, 'invites + question + like received');
  const lb = (await api('GET', '/api/leaderboard?period=week', { token: B.token })).data;
  assert.equal(lb[0].name, 'Sara'); assert.equal(lb[0].rank, 1);
  assert.ok(lb.find((x) => x.name === 'Bushra').isMe);
  const pub = (await api('GET', `/api/users/${B.user.id}/growth`)).data;
  assert.equal(pub.points, 20);
});

test('smart link counts clicks by source and sends each phone to its store', async () => {
  const ios = await api('GET', '/go?src=instagram', { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } });
  assert.equal(ios.status, 302); assert.equal(ios.headers.get('location'), 'https://apps.apple.com/app/id123');
  const and = await api('GET', '/go?src=snapchat', { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)' } });
  assert.ok(and.headers.get('location').includes('play.google.com'));
  const web = await api('GET', '/go?src=tiktok', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' } });
  assert.equal(web.headers.get('location'), base);
  ADMIN = await register('Admin', 'admin@test.io');
  const camp = await api('POST', '/api/admin/campaigns', { token: ADMIN.token, json: { code: 'noor2026', name: 'Influencer Noor (Snapchat)' } });
  assert.equal(camp.status, 201); assert.equal(camp.data.code, 'NOOR2026');
  assert.equal((await api('POST', '/api/admin/campaigns', { token: A.token, json: { code: 'x123', name: 'x' } })).status, 403);
  const viaCamp = await api('GET', '/go?src=snapchat&c=NOOR2026', { headers: { 'User-Agent': 'iPhone' } });
  assert.ok(viaCamp.headers.get('location').includes('/i/NOOR2026'));
  await register('Fan', 'fan@test.io', { inviteCode: 'NOOR2026' });
  const stats = (await api('GET', '/api/admin/growth', { token: ADMIN.token })).data;
  assert.equal(stats.campaigns[0].code, 'NOOR2026'); assert.equal(stats.campaigns[0].signups, 1); assert.equal(stats.campaigns[0].clicks, 1);
  assert.ok(stats.clicksBySource.some((c) => c.source === 'instagram' && c.os === 'ios'));
  assert.equal(stats.viaInvites, 3); assert.equal(stats.topInviters[0].name, 'Sara');
});

test('search-engine pages: landing, category, sitemap, robots', async () => {
  const home = await (await fetch(`${base}/?lang=en`)).text();
  assert.ok(home.includes('Latest questions') && home.includes('Best coffee shop in Riyadh?') && home.includes('/c/sports'));
  const cat = await (await fetch(`${base}/c/general?lang=ar`)).text();
  assert.ok(cat.includes('Best coffee shop') && cat.includes('dir="rtl"') && cat.includes('hreflang="tr"'));
  const sm = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.ok(sm.includes('<urlset') && sm.includes('/c/lostfound') && sm.includes('/q/'));
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  assert.ok(robots.includes('Sitemap:') && robots.includes('Disallow: /api/'));
});

test('Content Studio: items for admins and direct publishing', async () => {
  assert.equal((await api('GET', '/api/admin/studio/items', { token: A.token })).status, 403);
  const items = (await api('GET', '/api/admin/studio/items', { token: ADMIN.token })).data;
  assert.equal(items[0].content, 'Best coffee shop in Riyadh?'); assert.equal(items[0].answer, 'Try Brew92 in Olaya');
  const studio = await fetch(`${base}/studio`);
  assert.equal(studio.status, 200); assert.ok((await studio.text()).includes('<canvas'));
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex');
  const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'studio.png'); fd.append('caption', 'Question of the day'); fd.append('targets', 'facebook,instagram');
  const r = (await api('POST', '/api/admin/studio/publish', { token: ADMIN.token, form: fd })).data;
  assert.equal(r.result.facebook.id, 'photo-1'); assert.equal(r.result.instagram.id, 'ig-9');
  const photo = calls.find((c) => c.path === '/PAGE1/photos');
  assert.ok(new URLSearchParams(photo.body).get('url').includes('/uploads/'));
});
