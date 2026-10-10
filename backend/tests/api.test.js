// End-to-end tests: starts the real server on a random port with a throwaway database.
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'query-test-'));
process.env.DB_FILE = path.join(tmp, 'test.db');
process.env.DISABLE_PUSH = '1';
process.env.ADMIN_EMAILS = 'admin@test.io';
process.env.REPORT_HIDE_THRESHOLD = '2';
process.env.AUTH_RATE_LIMIT = '1000';

const { createApp } = require('../src/app');
require('../src/seed').ensureCategories();

let base;
let server;
const logs = [];
const origLog = console.log;

test.before(async () => {
  server = http.createServer(createApp({ uploadDir: path.join(tmp, 'uploads') }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log = (...a) => { logs.push(a.join(' ')); };
});
test.after(() => { console.log = origLog; server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function api(method, p, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(base + p, { method, headers, body });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const register = async (name, email) => (await api('POST', '/api/auth/register', { json: { name, email, password: 'secret123' } })).data;

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000100e221bc330000000049454e44ae426082', 'hex');
const blob = (buf, type) => new Blob([buf], { type });

let A, B, C, ADMIN, cats;

test('health + categories', async () => {
  assert.equal((await api('GET', '/health')).data.ok, true);
  cats = (await api('GET', '/api/categories')).data;
  assert.equal(cats.length, 17);
  assert.ok(cats.every((c) => c.nameTr && c.nameEs), 'every category has Turkish and Spanish names');
  assert.equal(cats[15].key, 'lostfound');
  assert.equal(cats[14].key, 'reviews');
  assert.equal(cats[16].key, 'general', 'General is last (full width)');
  assert.ok(cats[16].nameAr && cats[16].color);
});

test('register, duplicate email, validation, login', async () => {
  A = await register('Ahmad', 'a@test.io');
  B = await register('Bushra', 'b@test.io');
  C = await register('Cyrus', 'c@test.io');
  ADMIN = await register('Admin', 'admin@test.io');
  assert.ok(A.token && A.user.id);
  assert.equal(ADMIN.user.isAdmin, true);
  assert.equal(A.user.isAdmin, false);
  assert.equal((await api('POST', '/api/auth/register', { json: { name: 'X', email: 'a@test.io', password: 'secret123' } })).status, 400); // name too short
  assert.equal((await api('POST', '/api/auth/register', { json: { name: 'Xy', email: 'A@TEST.io', password: 'secret123' } })).data.error, 'EMAIL_TAKEN');
  const bad = await api('POST', '/api/auth/register', { json: { name: 'Xy', email: 'nope', password: '1' } });
  assert.equal(bad.data.error, 'VALIDATION_ERROR');
  assert.ok(bad.data.details.email && bad.data.details.password);
  assert.equal((await api('POST', '/api/auth/login', { json: { email: 'a@test.io', password: 'wrongpass' } })).data.error, 'INVALID_CREDENTIALS');
  const ok = await api('POST', '/api/auth/login', { json: { email: 'A@test.io', password: 'secret123' } });
  assert.equal(ok.status, 200);
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('GET', '/api/me', { token: 'bad.token.here' })).status, 401);
});

test('new users follow all categories', async () => {
  const subs = (await api('GET', '/api/me/subscriptions', { token: A.token })).data;
  assert.equal(subs.length, 17);
  const put = await api('PUT', '/api/me/subscriptions', { token: C.token, json: { categoryIds: [cats[0].id, 9999] } });
  assert.deepEqual(put.data, [cats[0].id]);
});

let textPost, pollPost, imagePost, locPost, anonPost;

test('create every question type with validation', async () => {
  const general = cats[16].id;
  assert.equal((await api('POST', '/api/posts', { token: A.token, json: { categoryId: general, type: 'TEXT', content: 'hi' } })).status, 400);
  textPost = (await api('POST', '/api/posts', { token: A.token, json: { categoryId: general, type: 'TEXT', content: 'What is the best laptop for students?' } })).data;
  assert.equal(textPost.type, 'TEXT');
  assert.equal(textPost.author.name, 'Ahmad');

  const badPoll = await api('POST', '/api/posts', { token: A.token, json: { categoryId: general, type: 'POLL', content: 'Pick one', pollOptions: '["only one"]' } });
  assert.equal(badPoll.data.details.pollOptions, 'min:2');
  pollPost = (await api('POST', '/api/posts', { token: A.token, json: { categoryId: general, type: 'POLL', content: 'Tea or coffee?', pollOptions: JSON.stringify(['Tea', 'Coffee', '', 'Juice']) } })).data;
  assert.equal(pollPost.poll.options.length, 3);

  assert.equal((await api('POST', '/api/posts', { token: A.token, json: { categoryId: general, type: 'LOCATION', content: 'Where?' } })).data.details.location, 'required');
  locPost = (await api('POST', '/api/posts', { token: B.token, json: { categoryId: cats[9].id, type: 'LOCATION', content: 'Parking here?', lat: 21.5, lng: 39.2, placeName: 'Jeddah' } })).data;
  assert.equal(locPost.location.name, 'Jeddah');

  const missing = await api('POST', '/api/posts', { token: A.token, json: { categoryId: general, type: 'IMAGE' } });
  assert.equal(missing.data.details.media, 'required');
  const fd = new FormData();
  fd.append('categoryId', String(general)); fd.append('type', 'IMAGE'); fd.append('content', 'What plant is this?');
  fd.append('media', blob(PNG, 'image/png'), 'plant.png');
  const img = await api('POST', '/api/posts', { token: A.token, form: fd });
  assert.equal(img.status, 201);
  imagePost = img.data;
  assert.match(imagePost.mediaUrl, /\/uploads\/[a-f0-9]+\.png$/);
  const file = await fetch(imagePost.mediaUrl.replace(/^https?:\/\/[^/]+/, base));
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await file.arrayBuffer()).length, PNG.length);

  const evil = new FormData();
  evil.append('categoryId', String(general)); evil.append('type', 'IMAGE');
  evil.append('media', blob(Buffer.from('<script>'), 'text/html'), 'x.html');
  assert.equal((await api('POST', '/api/posts', { token: A.token, form: evil })).data.error, 'UNSUPPORTED_FILE');

  anonPost = (await api('POST', '/api/posts', { token: C.token, json: { categoryId: cats[1].id, type: 'TEXT', content: 'A private health question', anonymous: true } })).data;
  assert.equal(anonPost.author.name, 'Cyrus'); // visible to its own author
});

test('video upload supports HTTP range requests', async () => {
  const fd = new FormData();
  fd.append('categoryId', String(cats[16].id)); fd.append('type', 'VIDEO');
  fd.append('media', blob(Buffer.alloc(5000, 7), 'video/mp4'), 'clip.mp4');
  const v = (await api('POST', '/api/posts', { token: B.token, form: fd })).data;
  const res = await fetch(v.mediaUrl.replace(/^https?:\/\/[^/]+/, base), { headers: { Range: 'bytes=100-199' } });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), 'bytes 100-199/5000');
  assert.equal((await res.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(`${base}/uploads/..%2F..%2Fetc%2Fpasswd`)).status, 404);
});

test('anonymous author hidden from others', async () => {
  const seen = (await api('GET', `/api/posts/${anonPost.id}`, { token: A.token })).data;
  assert.equal(seen.author, null);
  assert.equal(seen.isAnonymous, true);
  const byUser = (await api('GET', `/api/posts?user=${C.user.id}`, { token: A.token })).data;
  assert.equal(byUser.items.length, 0);
  const profile = (await api('GET', `/api/users/${C.user.id}`)).data;
  assert.equal(profile.stats.questions, 0);
});

test('feed filters, search, sort and pagination', async () => {
  const all = (await api('GET', '/api/posts', { token: A.token })).data;
  assert.equal(all.items.length, 6);
  assert.equal(all.items[0].type, 'VIDEO'); // newest first
  assert.equal((await api('GET', `/api/posts?category=${cats[9].id}`)).data.items.length, 1);
  assert.equal((await api('GET', '/api/posts?q=laptop')).data.items[0].id, textPost.id);
  assert.equal((await api('GET', '/api/posts?type=POLL')).data.items.length, 1);
  assert.equal((await api('GET', '/api/posts?mine=1', { token: A.token })).data.items.length, 3);
  assert.equal((await api('GET', '/api/posts?mine=1')).status, 401);
  const near = (await api('GET', '/api/posts?near=21.51,39.21&radiusKm=5')).data.items;
  assert.equal(near.length, 1);
  assert.ok(near[0].distanceKm < 5);
  assert.equal((await api('GET', '/api/posts?near=24.7,46.7&radiusKm=5')).data.items.length, 0);
});

test('likes, bookmarks, votes', async () => {
  let p = (await api('POST', `/api/posts/${textPost.id}/like`, { token: B.token })).data;
  assert.equal(p.likeCount, 1); assert.equal(p.liked, true);
  p = (await api('POST', `/api/posts/${textPost.id}/like`, { token: B.token })).data;
  assert.equal(p.likeCount, 1, 'liking twice counts once');
  p = (await api('DELETE', `/api/posts/${textPost.id}/like`, { token: B.token })).data;
  assert.equal(p.likeCount, 0);
  await api('POST', `/api/posts/${textPost.id}/bookmark`, { token: B.token });
  assert.equal((await api('GET', '/api/posts?bookmarked=1', { token: B.token })).data.items[0].id, textPost.id);
  const [tea, coffee] = pollPost.poll.options;
  p = (await api('POST', `/api/posts/${pollPost.id}/vote`, { token: B.token, json: { optionId: tea.id } })).data;
  assert.equal(p.poll.total, 1); assert.equal(p.poll.myVote, tea.id);
  p = (await api('POST', `/api/posts/${pollPost.id}/vote`, { token: B.token, json: { optionId: coffee.id } })).data;
  assert.equal(p.poll.total, 1, 'changing a vote does not add one');
  assert.equal(p.poll.options.find((o) => o.id === coffee.id).votes, 1);
  assert.equal((await api('POST', `/api/posts/${pollPost.id}/vote`, { token: B.token, json: { optionId: 'nope' } })).status, 400);
  assert.equal((await api('POST', `/api/posts/${textPost.id}/vote`, { token: B.token, json: { optionId: tea.id } })).data.error, 'NOT_A_POLL');
});

let answerB, answerC;

test('answers, best answer, edit/delete permissions, notifications', async () => {
  answerB = (await api('POST', `/api/posts/${textPost.id}/comments`, { token: B.token, json: { content: 'A ThinkPad is great.' } })).data;
  answerC = (await api('POST', `/api/posts/${textPost.id}/comments`, { token: C.token, json: { content: 'MacBook Air.' } })).data;
  assert.equal((await api('POST', `/api/posts/${textPost.id}/comments`, { token: C.token, json: { content: '' } })).status, 400);
  let list = (await api('GET', `/api/posts/${textPost.id}/comments`, { token: A.token })).data.items;
  assert.equal(list.length, 2);
  assert.equal(list[0].canDelete, true, 'question author can remove answers');

  assert.equal((await api('POST', `/api/posts/${textPost.id}/best`, { token: B.token, json: { commentId: answerC.id } })).status, 403);
  const withBest = (await api('POST', `/api/posts/${textPost.id}/best`, { token: A.token, json: { commentId: answerC.id } })).data;
  assert.equal(withBest.bestCommentId, answerC.id);
  list = (await api('GET', `/api/posts/${textPost.id}/comments`)).data.items;
  assert.equal(list[0].id, answerC.id, 'best answer pinned first');

  assert.equal((await api('PATCH', `/api/comments/${answerB.id}`, { token: C.token, json: { content: 'hack' } })).status, 403);
  const edited = (await api('PATCH', `/api/comments/${answerB.id}`, { token: B.token, json: { content: 'A ThinkPad E14 is great.' } })).data;
  assert.ok(edited.updatedAt);

  const notesA = (await api('GET', '/api/notifications', { token: A.token })).data.items;
  assert.ok(notesA.filter((n) => n.type === 'comment').length >= 2);
  assert.ok(notesA.some((n) => n.text.includes('Bushra')));
  const notesC = (await api('GET', '/api/notifications', { token: C.token })).data.items;
  assert.ok(notesC.some((n) => n.type === 'best'));
  const me = (await api('GET', '/api/me', { token: C.token })).data;
  assert.ok(me.unreadNotifications > 0);
  await api('POST', '/api/notifications/read-all', { token: C.token });
  assert.equal((await api('GET', '/api/me', { token: C.token })).data.unreadNotifications, 0);

  // Subscribers of a category get "new question" notifications (C follows only Technology)
  await api('POST', '/api/posts', { token: A.token, json: { categoryId: cats[0].id, type: 'TEXT', content: 'Which phone has the best camera?' } });
  const cNotes = (await api('GET', '/api/notifications', { token: C.token })).data.items;
  assert.ok(cNotes.some((n) => n.type === 'newPost'));

  // Deleting the best answer clears it
  await api('DELETE', `/api/comments/${answerC.id}`, { token: A.token });
  assert.equal((await api('GET', `/api/posts/${textPost.id}`)).data.bestCommentId, null);
  const prof = (await api('GET', `/api/users/${B.user.id}`)).data;
  assert.equal(prof.stats.answers, 1);
});

test('blocking hides content and stops answers', async () => {
  await api('POST', `/api/users/${B.user.id}/block`, { token: A.token });
  const feed = (await api('GET', '/api/posts', { token: A.token })).data.items;
  assert.ok(!feed.some((p) => p.author && p.author.id === B.user.id));
  const answers = (await api('GET', `/api/posts/${textPost.id}/comments`, { token: A.token })).data.items;
  assert.ok(!answers.some((c) => c.author.id === B.user.id));
  assert.equal((await api('POST', `/api/posts/${textPost.id}/comments`, { token: B.token, json: { content: 'hello?' } })).data.error, 'BLOCKED');
  assert.equal((await api('GET', '/api/me/blocked', { token: A.token })).data[0].id, B.user.id);
  // block the (unknown) author of an anonymous post
  await api('POST', `/api/posts/${anonPost.id}/block-author`, { token: A.token });
  assert.ok(!(await api('GET', '/api/posts', { token: A.token })).data.items.some((p) => p.id === anonPost.id));
  await api('DELETE', `/api/users/${B.user.id}/block`, { token: A.token });
  assert.equal((await api('GET', '/api/me/blocked', { token: A.token })).data.length, 1);
});

test('reports auto-hide content; admin restores', async () => {
  assert.equal((await api('POST', `/api/posts/${locPost.id}/report`, { token: B.token, json: { reason: 'spam' } })).data.error, 'CANNOT_REPORT_OWN');
  await api('POST', `/api/posts/${locPost.id}/report`, { token: A.token, json: { reason: 'spam' } });
  await api('POST', `/api/posts/${locPost.id}/report`, { token: A.token, json: { reason: 'spam again' } }); // same user counts once
  assert.equal((await api('GET', `/api/posts/${locPost.id}`)).status, 200);
  await api('POST', `/api/posts/${locPost.id}/report`, { token: C.token, json: { reason: 'offensive' } });
  assert.equal((await api('GET', `/api/posts/${locPost.id}`, { token: A.token })).status, 404, 'hidden after 2 reports');
  assert.equal((await api('GET', `/api/posts/${locPost.id}`, { token: B.token })).status, 200, 'author still sees it');
  assert.equal((await api('GET', '/api/admin/reports', { token: A.token })).status, 403);
  const reports = (await api('GET', '/api/admin/reports', { token: ADMIN.token })).data;
  assert.equal(reports[0].id, locPost.id);
  assert.equal(reports[0].reports, 2);
  await api('POST', `/api/admin/post/${locPost.id}/restore`, { token: ADMIN.token });
  assert.equal((await api('GET', `/api/posts/${locPost.id}`, { token: A.token })).status, 200);
});

test('profile update, avatar, theme, language', async () => {
  const upd = (await api('PATCH', '/api/me', { token: A.token, json: { name: 'Ahmad K', bio: 'Student', theme: 'indigo', language: 'en' } })).data;
  assert.equal(upd.name, 'Ahmad K'); assert.equal(upd.theme, 'indigo'); assert.equal(upd.language, 'en');
  assert.equal((await api('PATCH', '/api/me', { token: A.token, json: { theme: 'neon' } })).status, 400);
  const fd = new FormData(); fd.append('file', blob(PNG, 'image/png'), 'me.png');
  const withAvatar = (await api('POST', '/api/me/avatar', { token: A.token, form: fd })).data;
  assert.match(withAvatar.avatarUrl, /\.png$/);
});

test('forgot / reset / change password', async () => {
  assert.equal((await api('POST', '/api/auth/forgot-password', { json: { email: 'nobody@test.io' } })).data.ok, true);
  await api('POST', '/api/auth/forgot-password', { json: { email: 'b@test.io' } });
  const code = /code is (\d{6})/.exec(logs.join('\n'))[1];
  assert.equal((await api('POST', '/api/auth/reset-password', { json: { email: 'b@test.io', code: '000000', newPassword: 'newpass123' } })).data.error, 'INVALID_CODE');
  assert.equal((await api('POST', '/api/auth/reset-password', { json: { email: 'b@test.io', code, newPassword: 'newpass123' } })).data.ok, true);
  assert.equal((await api('POST', '/api/auth/reset-password', { json: { email: 'b@test.io', code, newPassword: 'again1234' } })).data.error, 'INVALID_CODE', 'code works once');
  const login = await api('POST', '/api/auth/login', { json: { email: 'b@test.io', password: 'newpass123' } });
  assert.equal(login.status, 200);
  assert.equal((await api('POST', '/api/auth/change-password', { token: B.token, json: { currentPassword: 'wrong', newPassword: 'abcdefgh1' } })).data.error, 'WRONG_PASSWORD');
  assert.equal((await api('POST', '/api/auth/change-password', { token: B.token, json: { currentPassword: 'newpass123', newPassword: 'abcdefgh1' } })).data.ok, true);
});

test('delete own post only; delete account removes everything', async () => {
  assert.equal((await api('DELETE', `/api/posts/${textPost.id}`, { token: C.token })).status, 403);
  assert.equal((await api('DELETE', `/api/posts/${pollPost.id}`, { token: A.token })).data.ok, true);
  assert.equal((await api('GET', `/api/posts/${pollPost.id}`)).status, 404);
  const before = (await api('GET', '/api/posts')).data.items.length;
  assert.equal((await api('DELETE', '/api/me', { token: A.token })).data.ok, true);
  assert.equal((await api('GET', '/api/me', { token: A.token })).status, 401);
  const after = (await api('GET', '/api/posts')).data.items.length;
  assert.ok(after < before);
  assert.ok(!(await api('GET', '/api/posts')).data.items.some((p) => p.author && p.author.id === A.user.id));
});

test('unknown routes and wrong methods', async () => {
  assert.equal((await api('GET', '/api/nope')).status, 404);
  assert.equal((await api('PUT', '/api/categories')).status, 405);
  const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal((await bad.json()).error, 'INVALID_JSON');
});

test('pagination returns 20 per page with hasMore', async () => {
  const U = await register('Pager', 'pager@test.io');
  for (let i = 0; i < 23; i++) await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[13].id, type: 'TEXT', content: `Question number ${i}` } });
  const p1 = (await api('GET', `/api/posts?category=${cats[13].id}`)).data;
  assert.equal(p1.items.length, 20); assert.equal(p1.hasMore, true);
  const p2 = (await api('GET', `/api/posts?category=${cats[13].id}&page=2`)).data;
  assert.equal(p2.items.length, 3); assert.equal(p2.hasMore, false);
  assert.ok(!p2.items.some((x) => p1.items.some((y) => y.id === x.id)), 'no duplicates across pages');
  const unanswered = (await api('GET', `/api/posts?category=${cats[13].id}&sort=unanswered`)).data;
  assert.equal(unanswered.items.length, 20);
});

test('automatic filter blocks pornographic, indecent and anti-religion content everywhere', async () => {
  const U = await register('Filter Tester', 'filter@test.io');
  const post = (content, extra = {}) => api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[16].id, type: 'TEXT', content, ...extra } });
  let r = await post('وين القى افلام سكس؟');
  assert.equal(r.status, 422); assert.equal(r.data.error, 'CONTENT_REJECTED'); assert.equal(r.data.details.reason, 'sexual');
  r = await post('the quran is garbage');
  assert.equal(r.data.details.reason, 'religion');
  r = await post('Kuran saçma'); assert.equal(r.status, 422);
  r = await post('quiero ver porno'); assert.equal(r.status, 422);
  r = await post('Which option?', { type: 'POLL', pollOptions: JSON.stringify(['ok', 'send nudes']) });
  assert.equal(r.data.details.reason, 'sexual', 'poll options are checked too');
  r = await post('ما تفسير سورة الكهف؟'); assert.equal(r.status, 201, 'normal religious questions are allowed');
  const good = r.data;
  const c = await api('POST', `/api/posts/${good.id}/comments`, { token: U.token, json: { content: 'الدين خرافة' } });
  assert.equal(c.data.error, 'CONTENT_REJECTED', 'answers are checked');
  const ok = await api('POST', `/api/posts/${good.id}/comments`, { token: U.token, json: { content: 'تفسير ابن كثير مفيد جداً' } });
  assert.equal(ok.status, 201);
  assert.equal((await api('PATCH', `/api/comments/${ok.data.id}`, { token: U.token, json: { content: 'p0rn' } })).data.error, 'CONTENT_REJECTED', 'edits are checked');
  assert.equal((await api('PATCH', '/api/me', { token: U.token, json: { bio: 'شرموطة' } })).data.error, 'CONTENT_REJECTED', 'profiles are checked');
  assert.equal((await api('POST', '/api/auth/register', { json: { name: 'xxx porn', email: 'p@test.io', password: 'secret123' } })).data.error, 'CONTENT_REJECTED');
});

test('Lost & Found: kind required, filters, resolve', async () => {
  const U = await register('Finder', 'finder@test.io');
  const lf = cats[15].id;
  assert.equal((await api('POST', '/api/posts', { token: U.token, json: { categoryId: lf, type: 'TEXT', content: 'Found a phone' } })).data.details.lfKind, 'required');
  const found = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: lf, type: 'TEXT', content: 'Found a black phone at the mall', lfKind: 'FOUND' } })).data;
  const lost = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: lf, type: 'LOCATION', content: 'Lost my wallet near the park', lfKind: 'LOST', lat: 24.7, lng: 46.7 } })).data;
  assert.deepEqual(found.lostFound, { kind: 'FOUND', resolved: false });
  assert.equal((await api('GET', `/api/posts?category=${lf}&lf=LOST`)).data.items[0].id, lost.id);
  assert.equal((await api('GET', `/api/posts?category=${lf}&lf=FOUND`)).data.items.length, 1);
  const other = await register('Other', 'other@test.io');
  assert.equal((await api('POST', `/api/posts/${lost.id}/resolve`, { token: other.token })).status, 403);
  const res = (await api('POST', `/api/posts/${lost.id}/resolve`, { token: U.token })).data;
  assert.equal(res.lostFound.resolved, true);
  assert.equal((await api('GET', `/api/posts?category=${lf}&open=1`)).data.items.length, 1, 'open=1 hides resolved items');
  const normal = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[16].id, type: 'TEXT', content: 'Normal question here', lfKind: 'LOST' } })).data;
  assert.equal(normal.lostFound, null, 'lost/found flag only applies in that category');
  assert.equal((await api('POST', `/api/posts/${normal.id}/resolve`, { token: U.token })).data.error, 'NOT_LOST_FOUND');
});

test('severe reports hide faster and alert admins; strikes lead to suspension', async () => {
  const author = await register('Bad Actor', 'bad@test.io');
  const r1 = await register('Reporter One', 'r1@test.io');
  const r2 = await register('Reporter Two', 'r2@test.io');
  const p = (await api('POST', '/api/posts', { token: author.token, json: { categoryId: cats[16].id, type: 'TEXT', content: 'An innocent-looking question' } })).data;
  process.env.SEVERE_REPORT_THRESHOLD = '2';
  await api('POST', `/api/posts/${p.id}/report`, { token: r1.token, json: { reason: 'religion' } });
  const adminNotes = (await api('GET', '/api/notifications', { token: ADMIN.token })).data.items;
  assert.ok(adminNotes.some((n) => n.type === 'report'), 'admins alerted on first severe report');
  await api('POST', `/api/posts/${p.id}/report`, { token: r2.token, json: { reason: 'sexual' } });
  assert.equal((await api('GET', `/api/posts/${p.id}`, { token: r1.token })).status, 404, 'hidden after 2 severe reports');
  const reports = (await api('GET', '/api/admin/reports', { token: ADMIN.token })).data;
  const item = reports.find((x) => x.id === p.id);
  assert.equal(item.severe, 2); assert.equal(item.author_id, author.user.id);
  const removed = (await api('POST', `/api/admin/post/${p.id}/remove`, { token: ADMIN.token, json: { ban: '7d' } })).data;
  assert.ok(removed.bannedUntil > Date.now());
  assert.equal((await api('GET', '/api/me', { token: author.token })).data.error, 'ACCOUNT_SUSPENDED');
  assert.equal((await api('POST', '/api/auth/login', { json: { email: 'bad@test.io', password: 'secret123' } })).data.error, 'ACCOUNT_SUSPENDED');
  assert.ok((await api('GET', '/api/notifications', { token: ADMIN.token })).status === 200);
  await api('POST', `/api/admin/users/${author.user.id}/unban`, { token: ADMIN.token });
  assert.equal((await api('GET', '/api/me', { token: author.token })).status, 200);
  // three strikes → automatic 30-day suspension
  for (let i = 0; i < 3; i++) {
    const x = (await api('POST', '/api/posts', { token: author.token, json: { categoryId: cats[16].id, type: 'TEXT', content: `Spammy question ${i}` } })).data;
    if (!x.id) break;
    await api('POST', `/api/admin/post/${x.id}/remove`, { token: ADMIN.token, json: {} });
  }
  assert.equal((await api('GET', '/api/me', { token: author.token })).data.error, 'ACCOUNT_SUSPENDED');
});

test('Turkish and Spanish users', async () => {
  const T = (await api('POST', '/api/auth/register', { json: { name: 'Ayşe', email: 'ayse@test.io', password: 'secret123', language: 'tr' } })).data;
  assert.equal(T.user.language, 'tr');
  assert.equal((await api('PATCH', '/api/me', { token: T.token, json: { language: 'es' } })).data.language, 'es');
  assert.equal((await api('PATCH', '/api/me', { token: T.token, json: { language: 'fr' } })).status, 400);
  await api('PATCH', '/api/me', { token: T.token, json: { language: 'tr' } });
  await api('POST', '/api/posts', { token: ADMIN.token, json: { categoryId: cats[16].id, type: 'TEXT', content: 'Genel bir soru burada' } });
  const n = (await api('GET', '/api/notifications', { token: T.token })).data.items;
  assert.ok(n.some((x) => x.text.includes('Genel')), 'Turkish notification with Turkish category name');
});

test('public web pages for the stores', async () => {
  const pageOf = async (p) => { const r = await fetch(base + p); return { status: r.status, type: r.headers.get('content-type'), html: await r.text() }; };
  let pg = await pageOf('/privacy?lang=ar');
  assert.equal(pg.status, 200); assert.match(pg.type, /text\/html/); assert.ok(pg.html.includes('dir="rtl"') && pg.html.includes('البيانات التي نجمعها'));
  assert.ok((await pageOf('/privacy?lang=tr')).html.includes('Gizlilik'));
  assert.ok((await pageOf('/terms?lang=es')).html.includes('religiones'));
  assert.ok((await pageOf('/terms?lang=en')).html.includes('Pornographic'));
  pg = await pageOf('/delete-account?lang=en');
  assert.ok(pg.html.includes('<form') && pg.html.includes('name="password"'));
  const D = await register('To Delete', 'todelete@test.io');
  const bad = await fetch(`${base}/delete-account?lang=en`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=todelete%40test.io&password=nope' });
  assert.ok((await bad.text()).includes('Wrong email or password'));
  const good = await fetch(`${base}/delete-account?lang=en`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=todelete%40test.io&password=secret123' });
  assert.ok((await good.text()).includes('permanently deleted'));
  assert.equal((await api('GET', '/api/me', { token: D.token })).status, 401);
});
