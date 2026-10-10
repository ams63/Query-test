// Reviews, product pages, Sign in with Apple/Google/Facebook, public share pages, and the Meta integrations.
// A local fake server stands in for Apple/Google key servers and the Facebook Graph API.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'query-social-'));
Object.assign(process.env, {
  DB_FILE: path.join(tmp, 'test.db'), DISABLE_PUSH: '1', AUTH_RATE_LIMIT: '1000', ADMIN_EMAILS: 'admin@test.io',
  APPLE_CLIENT_IDS: 'com.query.app', GOOGLE_CLIENT_IDS: 'google-web-client.apps.googleusercontent.com',
  FB_APP_ID: '111', FB_APP_SECRET: 'fbsecret', FB_PAGE_ID: 'PAGE1', FB_PAGE_TOKEN: 'PAGETOKEN', IG_USER_ID: 'IG1',
  WHATSAPP_TOKEN: 'WATOKEN', LINKEDIN_CLIENT_ID: 'li-client', LINKEDIN_CLIENT_SECRET: 'li-secret', LINKEDIN_ORG_ID: '777', LINKEDIN_ORG_TOKEN: 'LITOKEN', META_APP_SECRET: 'appsecret', META_VERIFY_TOKEN: 'verify-me', APPLE_TEAM_ID: 'TEAM123', ANDROID_SHA256: 'AA:BB',
});

// ---- fake providers ----
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const graphCalls = [];
let fake;
function makeJwt(payload, key = privateKey, kid = 'k1') {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, ...payload })).toString('base64url');
  return `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url')}`;
}

let base; let server;
test.before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      graphCalls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body, auth: req.headers.authorization });
      const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/jwks') return json({ keys: [jwk] });
      if (u.pathname === '/linkedin/token') {
        const f = new URLSearchParams(body);
        if (f.get('code') !== 'LI_CODE' || f.get('client_secret') !== 'li-secret') { res.writeHead(400); return res.end('{}'); }
        return json({ access_token: 'x', id_token: makeJwt({ iss: 'https://www.linkedin.com/oauth', aud: 'li-client', sub: 'li-555', email: 'huda@work.test', email_verified: true, name: 'Huda Recruiter' }) });
      }
      if (u.pathname === '/rest/posts') { res.writeHead(201, { 'x-restli-id': 'urn:li:share:123' }); return res.end(); }
      if (u.pathname === '/debug_token') {
        const good = u.searchParams.get('input_token') === 'FB_GOOD';
        return json({ data: { is_valid: good, app_id: '111', user_id: 'fb-42' } });
      }
      if (u.pathname === '/me') return json({ id: 'fb-42', name: 'Fatima FB', email: 'fatima@fb.test', picture: { data: { url: 'https://example.com/f.jpg' } } });
      if (u.pathname === '/PAGE1/feed') return json({ id: 'PAGE1_999' });
      if (u.pathname === '/IG1/media') return json({ id: 'container-1' });
      if (u.pathname === '/IG1/media_publish') return json({ id: 'ig-post-1' });
      if (u.pathname === '/me/messages') return json({ message_id: 'm1' });
      if (u.pathname === '/PHONE1/messages') return json({ messages: [{ id: 'wamid.1' }] });
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const fb = `http://127.0.0.1:${fake.address().port}`;
  Object.assign(process.env, { APPLE_JWKS_URL: `${fb}/jwks`, GOOGLE_JWKS_URL: `${fb}/jwks`, META_GRAPH_URL: fb, LINKEDIN_JWKS_URL: `${fb}/jwks`, LINKEDIN_TOKEN_URL: `${fb}/linkedin/token`, LINKEDIN_API_URL: fb });
  require('../src/seed').ensureCategories();
  server = http.createServer(require('../src/app').createApp({ uploadDir: path.join(tmp, 'uploads') }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); fake.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function api(method, p, { token, json, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (raw) { h['Content-Type'] = 'application/json'; body = raw; }
  const res = await fetch(base + p, { method, headers: h, body });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const register = async (name, email) => (await api('POST', '/api/auth/register', { json: { name, email, password: 'secret123' } })).data;
let cats;

test('categories: reviews then Lost & Found at the end', async () => {
  cats = (await api('GET', '/api/categories')).data;
  assert.deepEqual(cats.slice(-3).map((c) => c.key), ['reviews', 'lostfound', 'general']);
  assert.equal(cats.find((c) => c.key === 'reviews').nameAr, 'قيّم منتجاً اشتريته');
});

test('product reviews: validation, one per person, product pages', async () => {
  const A = await register('Reviewer A', 'ra@test.io');
  const B = await register('Reviewer B', 'rb@test.io');
  const rv = cats.find((c) => c.key === 'reviews').id;
  let r = await api('POST', '/api/posts', { token: A.token, json: { categoryId: rv, type: 'TEXT', content: 'Great!' } });
  assert.equal(r.data.error, 'VALIDATION_ERROR'); assert.ok(r.data.details.productName && r.data.details.rating);
  r = await api('POST', '/api/posts', { token: A.token, json: { categoryId: rv, type: 'TEXT', productName: 'iPhone 15 Pro', rating: 6, content: 'x' } });
  assert.equal(r.status, 400, 'rating must be 1..5');
  r = await api('POST', '/api/posts', { token: A.token, json: { categoryId: rv, type: 'TEXT', productName: 'iPhone 15 Pro', store: 'Jarir', price: 4999, rating: 5, pros: 'Camera, battery', cons: 'Price' } });
  assert.equal(r.status, 201, 'pros/cons alone are enough text');
  assert.deepEqual({ ...r.data.review, productKey: undefined }, { productName: 'iPhone 15 Pro', productKey: undefined, store: 'Jarir', price: 4999, rating: 5, pros: 'Camera, battery', cons: 'Price' });
  const key = r.data.review.productKey;
  assert.equal((await api('POST', '/api/posts', { token: A.token, json: { categoryId: rv, type: 'TEXT', productName: ' iphone-15  PRO ', rating: 1, content: 'changed my mind' } })).data.error, 'ALREADY_REVIEWED');
  await api('POST', '/api/posts', { token: B.token, json: { categoryId: rv, type: 'TEXT', productName: 'IPHONE 15 pro', rating: 4, content: 'Very good but heavy', price: 4799 } });
  await api('POST', '/api/posts', { token: B.token, json: { categoryId: rv, type: 'TEXT', productName: 'Galaxy S24', rating: 3, content: 'Okay phone overall' } });
  assert.equal((await api('POST', '/api/posts', { token: B.token, json: { categoryId: rv, type: 'TEXT', productName: 'porn dvd', rating: 5, content: 'nice' } })).data.error, 'CONTENT_REJECTED');
  const summary = (await api('GET', `/api/products/${encodeURIComponent(key)}`)).data;
  assert.equal(summary.reviews, 2); assert.equal(summary.avg, 4.5); assert.equal(summary.stars[5], 1); assert.equal(summary.minPrice, 4799);
  const list = (await api('GET', '/api/products')).data;
  assert.equal(list[0].key, key, 'most reviewed first');
  assert.equal((await api('GET', '/api/products?q=galaxy')).data.length, 1);
  assert.equal((await api('GET', `/api/posts?product=${encodeURIComponent(key)}`)).data.items.length, 2);
  assert.equal((await api('GET', '/api/products/unknown')).status, 404);
});

test('Sign in with Apple and Google (verified tokens)', async () => {
  assert.deepEqual((await api('GET', '/api/auth/providers')).data, { linkedin: true, apple: true, google: true, facebook: true });
  const appleTok = makeJwt({ iss: 'https://appleid.apple.com', aud: 'com.query.app', sub: 'apple-001', email: 'noor@privaterelay.appleid.com', email_verified: 'true' });
  let r = await api('POST', '/api/auth/social', { json: { provider: 'apple', token: appleTok, name: 'Noor', language: 'tr' } });
  assert.equal(r.status, 200); assert.equal(r.data.isNew, true); assert.equal(r.data.user.name, 'Noor'); assert.equal(r.data.user.language, 'tr');
  assert.equal(r.data.user.hasPassword, false);
  const again = await api('POST', '/api/auth/social', { json: { provider: 'apple', token: appleTok } });
  assert.equal(again.data.isNew, false); assert.equal(again.data.user.id, r.data.user.id, 'same Apple ID → same account');
  // social users can set a password without knowing an old one
  assert.equal((await api('POST', '/api/auth/change-password', { token: r.data.token, json: { newPassword: 'mynewpass1' } })).data.ok, true);

  // Google with the same email as an existing password account → linked, not duplicated
  const existing = await register('Omar', 'omar@gmail.test');
  const gTok = makeJwt({ iss: 'https://accounts.google.com', aud: 'google-web-client.apps.googleusercontent.com', sub: 'g-777', email: 'omar@gmail.test', email_verified: true, name: 'Omar G' });
  r = await api('POST', '/api/auth/social', { json: { provider: 'google', token: gTok } });
  assert.equal(r.data.user.id, existing.user.id); assert.equal(r.data.isNew, false);

  // forged / wrong tokens are rejected
  const { privateKey: evil } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const forged = makeJwt({ iss: 'https://accounts.google.com', aud: 'google-web-client.apps.googleusercontent.com', sub: 'x', email: 'omar@gmail.test', email_verified: true }, evil);
  assert.equal((await api('POST', '/api/auth/social', { json: { provider: 'google', token: forged } })).data.error, 'INVALID_SOCIAL_TOKEN');
  const wrongAud = makeJwt({ iss: 'https://accounts.google.com', aud: 'someone-else', sub: 'x' });
  assert.equal((await api('POST', '/api/auth/social', { json: { provider: 'google', token: wrongAud } })).data.error, 'INVALID_SOCIAL_TOKEN');
  const expired = makeJwt({ iss: 'https://appleid.apple.com', aud: 'com.query.app', sub: 'a', exp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal((await api('POST', '/api/auth/social', { json: { provider: 'apple', token: expired } })).data.error, 'INVALID_SOCIAL_TOKEN');
  const unverified = makeJwt({ iss: 'https://accounts.google.com', aud: 'google-web-client.apps.googleusercontent.com', sub: 'g-888', email: 'omar@gmail.test', email_verified: false });
  assert.equal((await api('POST', '/api/auth/social', { json: { provider: 'google', token: unverified } })).data.error, 'EMAIL_TAKEN', 'unverified email never takes over an account');
});

test('Sign in with Facebook (token checked with the Graph API)', async () => {
  assert.equal((await api('POST', '/api/auth/social', { json: { provider: 'facebook', token: 'FB_BAD' } })).data.error, 'INVALID_SOCIAL_TOKEN');
  const r = await api('POST', '/api/auth/social', { json: { provider: 'facebook', token: 'FB_GOOD' } });
  assert.equal(r.status, 200); assert.equal(r.data.user.name, 'Fatima FB'); assert.equal(r.data.user.avatarUrl, 'https://example.com/f.jpg');
});

test('public question page has link-preview tags and hides anonymous authors', async () => {
  const U = await register('Sara', 'sara@test.io');
  const q = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[16].id, type: 'TEXT', content: 'What is the best way to learn Arabic calligraphy?' } })).data;
  const page = await fetch(`${base}/q/${q.id}?lang=en`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes('property="og:title" content="What is the best way to learn Arabic calligraphy?"'));
  assert.ok(html.includes('og:image') && html.includes('/og-image.png'));
  assert.ok(html.includes(`query://post/${q.id}`), 'open-in-app deep link');
  assert.ok(html.includes('Sara'));
  const anon = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[16].id, type: 'TEXT', content: 'A private question here', anonymous: true } })).data;
  const anonHtml = await (await fetch(`${base}/q/${anon.id}?lang=ar`)).text();
  assert.ok(!anonHtml.includes('Sara') && anonHtml.includes('مجهول') && anonHtml.includes('dir="rtl"'));
  assert.equal((await fetch(`${base}/q/nope`)).status, 404);
  assert.equal((await fetch(`${base}/og-image.png`)).headers.get('content-type'), 'image/png');
  const aasa = (await api('GET', '/.well-known/apple-app-site-association')).data;
  assert.equal(aasa.applinks.details[0].appIDs[0], 'TEAM123.com.query.app');
  assert.deepEqual((await api('GET', '/.well-known/assetlinks.json')).data[0].target.sha256_cert_fingerprints, ['AA:BB']);
});

test('question of the day goes to the Facebook Page and Instagram', async () => {
  const U = await register('Popular', 'pop@test.io');
  const V = await register('Voter', 'voter@test.io');
  const q = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[0].id, type: 'TEXT', content: 'Which laptop is best for programming students?' } })).data;
  await api('POST', `/api/posts/${q.id}/comments`, { token: V.token, json: { content: 'ThinkPad T14' } });
  await api('POST', `/api/posts/${q.id}/like`, { token: V.token });
  const ADMIN = await register('Admin', 'admin@test.io');
  assert.equal((await api('POST', '/api/admin/meta/share-daily', { token: U.token })).status, 403);
  graphCalls.length = 0;
  const r = (await api('POST', '/api/admin/meta/share-daily', { token: ADMIN.token })).data;
  assert.equal(r.postId, q.id); assert.equal(r.facebook, 'PAGE1_999'); assert.equal(r.instagram, 'ig-post-1');
  const feed = graphCalls.find((c) => c.path === '/PAGE1/feed');
  const params = new URLSearchParams(feed.body);
  assert.ok(params.get('message').includes('Which laptop') && params.get('link').endsWith(`/q/${q.id}`));
  assert.ok(graphCalls.some((c) => c.path === '/IG1/media_publish'));
  const again = (await api('POST', '/api/admin/meta/share-daily', { token: ADMIN.token })).data;
  assert.notEqual(again.postId, q.id, 'never shares the same question twice');
});

test('messaging webhook: verification, signature check, auto-reply in the sender language', async () => {
  const bad = await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`);
  assert.equal(bad.status, 403);
  const ok = await fetch(`${base}/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123`);
  assert.equal(await ok.text(), '123');
  const payload = JSON.stringify({
    object: 'page',
    entry: [{ messaging: [{ sender: { id: 'user-1' }, message: { text: 'مرحبا عندي سؤال' } }] }, { changes: [{ value: { metadata: { phone_number_id: 'PHONE1' }, messages: [{ from: '9665000', text: { body: 'hola, tengo una pregunta' } }] } }] }],
  });
  const sig = `sha256=${crypto.createHmac('sha256', 'appsecret').update(payload).digest('hex')}`;
  assert.equal((await api('POST', '/webhooks/meta', { raw: payload, headers: { 'X-Hub-Signature-256': 'sha256=forged' } })).status, 401);
  graphCalls.length = 0;
  const r = await api('POST', '/webhooks/meta', { raw: payload, headers: { 'X-Hub-Signature-256': sig } });
  assert.equal(r.data.sent, 2);
  const msgr = graphCalls.find((c) => c.path === '/me/messages');
  assert.ok(new URLSearchParams(msgr.body).get('message').includes('أهلاً بك في Query'));
  const wa = graphCalls.find((c) => c.path === '/PHONE1/messages');
  assert.equal(wa.auth, 'Bearer WATOKEN');
  assert.ok(JSON.parse(wa.body).text.body.startsWith('Bienvenido a Query'));
});


test('LinkedIn: sign in with a code, callback page, connect to an existing account, badge on posts', async () => {
  const cb = await fetch(`${base}/auth/linkedin/callback?code=LI_CODE&state=s1`, { redirect: 'manual' });
  assert.equal(cb.status, 302); assert.equal(cb.headers.get('location'), 'query://auth/linkedin?code=LI_CODE&state=s1&error=');
  const redirectUri = `${base}/auth/linkedin/callback`;
  assert.equal((await api('POST', '/api/auth/social', { json: { provider: 'linkedin', token: 'WRONG', redirectUri } })).data.error, 'INVALID_SOCIAL_TOKEN');
  const r = await api('POST', '/api/auth/social', { json: { provider: 'linkedin', token: 'LI_CODE', redirectUri } });
  assert.equal(r.status, 200); assert.equal(r.data.user.name, 'Huda Recruiter'); assert.equal(r.data.user.linkedinVerified, true);
  const tokenCall = graphCalls.find((c) => c.path === '/linkedin/token');
  assert.equal(new URLSearchParams(tokenCall.body).get('redirect_uri'), redirectUri, 'secret exchange happens on the server');

  // an existing email account connects LinkedIn later → verified badge
  const U = await register('Khaled', 'khaled@test.io');
  assert.equal((await api('POST', '/api/me/link', { token: U.token, json: { provider: 'linkedin', token: 'LI_CODE', redirectUri } })).data.error, 'IDENTITY_IN_USE', 'one LinkedIn account per Query account');
  // profile link validation
  assert.equal((await api('PATCH', '/api/me', { token: U.token, json: { linkedinUrl: 'https://evil.com/in/x' } })).data.details.linkedinUrl, 'invalid');
  const ok = (await api('PATCH', '/api/me', { token: U.token, json: { linkedinUrl: 'linkedin.com/in/khaled-dev' } })).data;
  assert.equal(ok.linkedinUrl, 'https://linkedin.com/in/khaled-dev');
  const q = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats.find((c) => c.key === 'tech').id, type: 'TEXT', content: 'Which certificate helps backend developers most?' } })).data;
  assert.equal(q.author.linkedinUrl, 'https://linkedin.com/in/khaled-dev'); assert.equal(q.author.linkedinVerified, false);
  const hq = (await api('POST', `/api/posts/${q.id}/comments`, { token: r.data.token, json: { content: 'AWS Solutions Architect is in demand.' } })).data;
  assert.equal(hq.author.linkedinVerified, true, 'answer shows the LinkedIn-verified badge');
  assert.equal((await api('PATCH', '/api/me', { token: U.token, json: { linkedinUrl: '' } })).data.linkedinUrl, null);
});

test('Jobs category: job opportunities; health & law carry an advisory flag', async () => {
  const U = await register('HR Manager', 'hr@test.io');
  const jobs = cats.find((c) => c.key === 'money').id;
  assert.equal((await api('POST', '/api/posts', { token: U.token, json: { categoryId: jobs, type: 'TEXT', postKind: 'JOB', content: 'We are hiring' } })).data.details.jobTitle, 'required');
  assert.equal((await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats[16].id, type: 'TEXT', postKind: 'JOB', jobTitle: 'Dev', content: 'x' } })).data.details.postKind, 'jobs_category_only');
  assert.equal((await api('POST', '/api/posts', { token: U.token, json: { categoryId: jobs, type: 'TEXT', postKind: 'JOB', jobTitle: 'Dev', applyUrl: 'javascript:alert(1)' } })).data.details.applyUrl, 'invalid');
  const j = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: jobs, type: 'TEXT', postKind: 'JOB', jobTitle: 'Frontend Developer', jobCompany: 'Query', jobCity: 'Riyadh', jobType: 'REMOTE', applyUrl: 'www.linkedin.com/jobs/view/123', content: 'React + TypeScript, 3+ years.' } })).data;
  assert.deepEqual(j.job, { title: 'Frontend Developer', company: 'Query', city: 'Riyadh', type: 'REMOTE', applyUrl: 'https://www.linkedin.com/jobs/view/123' });
  assert.equal((await api('GET', `/api/posts?category=${jobs}&kind=job`)).data.items.length, 1);
  const h = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats.find((c) => c.key === 'health').id, type: 'TEXT', content: 'Is it normal to feel dizzy after fasting?' } })).data;
  assert.equal(h.advisory, 'health');
  const lw = (await api('POST', '/api/posts', { token: U.token, json: { categoryId: cats.find((c) => c.key === 'law').id, type: 'TEXT', content: 'How do I renew a commercial registration?' } })).data;
  assert.equal(lw.advisory, 'law'); assert.equal(j.advisory, null);
});

test('LinkedIn company page: professional question of the week', async () => {
  const ADMIN = (await api('POST', '/api/auth/login', { json: { email: 'admin@test.io', password: 'secret123' } })).data;
  graphCalls.length = 0;
  const r = (await api('POST', '/api/admin/linkedin/share', { token: ADMIN.token })).data;
  assert.equal(r.linkedin, 'urn:li:share:123');
  const call = graphCalls.find((c) => c.path === '/rest/posts');
  const body = JSON.parse(call.body);
  assert.equal(body.author, 'urn:li:organization:777'); assert.ok(body.content.article.source.includes('/q/'));
  const again = (await api('POST', '/api/admin/linkedin/share', { token: ADMIN.token })).data;
  assert.notEqual(again.postId, r.postId, 'never posts the same question twice');
});
