const crypto = require('node:crypto');
const { one, run, id, tx } = require('../db');
const { hashPassword, verifyPassword, sign } = require('../lib/auth');
const { check } = require('../lib/validate');
const { HttpError, saveUpload } = require('../lib/http');
const { sendMail } = require('../lib/mail');
const { PROVIDERS } = require('../lib/oidc');
const { resolveCode, ensureInviteCode } = require('../lib/growth');
const { notify } = require('../lib/notify');

// Credit the friend who invited this user (or the campaign that brought them)
function applyCode(uid, name, code) {
  const r = resolveCode(code);
  if (r.invitedBy && r.invitedBy !== uid) {
    run('UPDATE users SET invited_by = ? WHERE id = ? AND invited_by IS NULL', r.invitedBy, uid);
    notify(r.invitedBy, 'invited', { actorId: uid, vars: { name } });
  } else if (r.campaign) run('UPDATE users SET campaign = ? WHERE id = ? AND campaign IS NULL', r.campaign, uid);
  ensureInviteCode(uid);
}
const S = require('../lib/serialize');
const { assertClean } = require('../lib/moderation');

const LANGS = ['ar', 'en', 'tr', 'es'];
const RESET_MAIL = {
  ar: ['Query – رمز استعادة كلمة المرور', 'رمز استعادة كلمة المرور في Query هو {code}، وينتهي خلال 15 دقيقة.'],
  en: ['Query – password reset code', 'Your Query reset code is {code}. It expires in 15 minutes.'],
  tr: ['Query – şifre sıfırlama kodu', 'Query şifre sıfırlama kodunuz {code}. 15 dakika içinde geçerliliğini yitirir.'],
  es: ['Query – código para restablecer la contraseña', 'Tu código de Query es {code}. Caduca en 15 minutos.'],
};

module.exports = (r, { requireAuth, limit, uploadDir }) => {
  r.post('/api/auth/register', limit, (ctx) => {
    const d = check({
      name: { type: 'string', required: true, min: 2, max: 60 },
      email: { type: 'email', required: true },
      password: { type: 'password', required: true, min: 8, max: 100 },
      language: { type: 'string', enum: LANGS, default: 'ar' },
      inviteCode: { type: 'string', max: 20 },
    }, ctx.body);
    assertClean(d.name);
    if (one('SELECT 1 FROM users WHERE email = ?', d.email)) throw new HttpError(409, 'EMAIL_TAKEN');
    const avatar = ctx.files.find((f) => f.field === 'image' || f.field === 'avatar');
    const avatarName = avatar ? saveUpload(avatar, 'image', uploadDir) : null;
    const uid = id();
    const admins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim());
    run('INSERT INTO users (id, name, email, password_hash, avatar_url, language, is_admin) VALUES (?,?,?,?,?,?,?)',
      uid, d.name, d.email, hashPassword(d.password), avatarName, d.language, admins.includes(d.email) ? 1 : 0);
    // New users follow every category by default so their feed is not empty
    run('INSERT INTO subscriptions (user_id, category_id) SELECT ?, id FROM categories', uid);
    applyCode(uid, d.name, d.inviteCode);
    const u = one('SELECT * FROM users WHERE id = ?', uid);
    return { status: 201, data: { token: sign({ sub: uid }), user: S.me(u, ctx.base) } };
  });

  r.post('/api/auth/login', limit, (ctx) => {
    const d = check({ email: { type: 'email', required: true }, password: { type: 'password', required: true } }, ctx.body);
    const u = one('SELECT * FROM users WHERE email = ?', d.email);
    if (!u || !verifyPassword(d.password, u.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS');
    if (u.banned_until && u.banned_until > Date.now()) throw new HttpError(403, 'ACCOUNT_SUSPENDED', { until: u.banned_until });
    return { token: sign({ sub: u.id }), user: S.me(u, ctx.base) };
  });

  // Always answers OK so attackers cannot discover which emails are registered
  r.post('/api/auth/forgot-password', limit, async (ctx) => {
    const d = check({ email: { type: 'email', required: true } }, ctx.body);
    const u = one('SELECT id, language FROM users WHERE email = ?', d.email);
    if (u) {
      const code = String(crypto.randomInt(100000, 1000000));
      run('INSERT INTO password_resets (id, user_id, code_hash, expires_at) VALUES (?,?,?,?)', id(), u.id, hashPassword(code), Date.now() + 15 * 60e3);
      const [subject, body] = RESET_MAIL[u.language] || RESET_MAIL.en;
      // English line kept at the end so automated tests and support can always find the code
      await sendMail(d.email, subject, `${body.replace('{code}', code)}\n\nYour Query reset code is ${code}.`);
    }
    return { ok: true };
  });

  r.post('/api/auth/reset-password', limit, (ctx) => {
    const d = check({
      email: { type: 'email', required: true }, code: { type: 'string', required: true, min: 6, max: 6 },
      newPassword: { type: 'password', required: true, min: 8, max: 100 },
    }, ctx.body);
    const u = one('SELECT id FROM users WHERE email = ?', d.email);
    const pr = u && one('SELECT * FROM password_resets WHERE user_id = ? AND used = 0 AND expires_at > ? ORDER BY expires_at DESC LIMIT 1', u.id, Date.now());
    if (!pr || pr.attempts >= 5) throw new HttpError(400, 'INVALID_CODE');
    if (!verifyPassword(d.code, pr.code_hash)) {
      run('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', pr.id);
      throw new HttpError(400, 'INVALID_CODE');
    }
    tx(() => {
      run('UPDATE password_resets SET used = 1 WHERE id = ?', pr.id);
      run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(d.newPassword), u.id);
    });
    return { ok: true };
  });

  // ---- Sign in with Apple / Google / Facebook ----
  r.get('/api/auth/providers', () => Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.configured()])));

  r.post('/api/auth/social', limit, async (ctx) => {
    const d = check({
      provider: { type: 'string', required: true, enum: Object.keys(PROVIDERS) },
      token: { type: 'string', required: true, max: 5000 },
      name: { type: 'string', max: 60 }, language: { type: 'string', enum: LANGS, default: 'ar' },
      inviteCode: { type: 'string', max: 20 }, redirectUri: { type: 'string', max: 500 },
    }, ctx.body);
    const provider = PROVIDERS[d.provider];
    if (!provider.configured()) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED');
    let info;
    try { info = await provider.verify(d.token, { redirectUri: d.redirectUri }); } catch (e) { throw new HttpError(401, 'INVALID_SOCIAL_TOKEN'); }

    let u = null;
    const link = one('SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?', d.provider, info.subject);
    if (link) u = one('SELECT * FROM users WHERE id = ?', link.user_id);
    // Same verified email as an existing account → link instead of creating a duplicate
    if (!u && info.email && info.emailVerified) u = one('SELECT * FROM users WHERE email = ?', info.email.toLowerCase());
    let isNew = false;
    if (!u) {
      isNew = true;
      let name = (d.name || info.name || (info.email ? info.email.split('@')[0] : '') || 'Query').trim().slice(0, 60);
      try { assertClean(name); } catch { name = 'Query'; }
      if (name.length < 2) name = 'Query';
      const uid = id();
      const email = (info.email || `${d.provider}-${info.subject}@users.query.local`).toLowerCase();
      if (one('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'EMAIL_TAKEN');
      const admins = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim());
      run('INSERT INTO users (id, name, email, password_hash, avatar_url, language, is_admin) VALUES (?,?,?,?,?,?,?)',
        uid, name, email, `social$${crypto.randomBytes(16).toString('hex')}`, info.picture, d.language, admins.includes(email) ? 1 : 0);
      run('INSERT INTO subscriptions (user_id, category_id) SELECT ?, id FROM categories', uid);
      applyCode(uid, name, d.inviteCode);
      u = one('SELECT * FROM users WHERE id = ?', uid);
    }
    if (u.banned_until && u.banned_until > Date.now()) throw new HttpError(403, 'ACCOUNT_SUSPENDED', { until: u.banned_until });
    run('INSERT OR IGNORE INTO user_identities (provider, subject, user_id) VALUES (?,?,?)', d.provider, info.subject, u.id);
    return { token: sign({ sub: u.id }), user: S.me(u, ctx.base), isNew };
  });

  // Link Apple / Google / LinkedIn to the signed-in account (e.g. "Connect LinkedIn" for the verified badge)
  r.post('/api/me/link', requireAuth, async (ctx) => {
    const d = check({ provider: { type: 'string', required: true, enum: Object.keys(PROVIDERS) }, token: { type: 'string', required: true, max: 5000 }, redirectUri: { type: 'string', max: 500 } }, ctx.body);
    const provider = PROVIDERS[d.provider];
    if (!provider.configured()) throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED');
    let info;
    try { info = await provider.verify(d.token, { redirectUri: d.redirectUri }); } catch { throw new HttpError(401, 'INVALID_SOCIAL_TOKEN'); }
    const other = one('SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?', d.provider, info.subject);
    if (other && other.user_id !== ctx.user.id) throw new HttpError(409, 'IDENTITY_IN_USE');
    run('INSERT OR IGNORE INTO user_identities (provider, subject, user_id) VALUES (?,?,?)', d.provider, info.subject, ctx.user.id);
    return S.me(one('SELECT * FROM users WHERE id = ?', ctx.user.id), ctx.base);
  });

  // LinkedIn only accepts https redirect addresses, so it comes back here and we hand the code to the app
  r.get('/auth/linkedin/callback', (ctx) => {
    const q = new URLSearchParams({ code: String(ctx.query.code || ''), state: String(ctx.query.state || ''), error: String(ctx.query.error || '') });
    ctx.res.writeHead(302, { Location: `${process.env.APP_SCHEME || 'query'}://auth/linkedin?${q}`, 'Cache-Control': 'no-store' });
    ctx.res.end();
  });

  r.post('/api/auth/change-password', requireAuth, (ctx) => {
    const socialOnly = String(ctx.user.password_hash).startsWith('social$');
    const d = check({ currentPassword: { type: 'password', required: !socialOnly }, newPassword: { type: 'password', required: true, min: 8, max: 100 } }, ctx.body);
    if (!socialOnly && !verifyPassword(d.currentPassword, ctx.user.password_hash)) throw new HttpError(400, 'WRONG_PASSWORD');
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(d.newPassword), ctx.user.id);
    return { ok: true };
  });
};
