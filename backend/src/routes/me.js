const fs = require('node:fs');
const path = require('node:path');
const { one, all, run, tx } = require('../db');
const { check } = require('../lib/validate');
const { HttpError, saveUpload } = require('../lib/http');
const S = require('../lib/serialize');
const { assertClean } = require('../lib/moderation');

module.exports = (r, { requireAuth, uploadDir }) => {
  r.get('/api/me', requireAuth, (ctx) => S.me(ctx.user, ctx.base));

  r.patch('/api/me', requireAuth, (ctx) => {
    const d = check({
      name: { type: 'string', min: 2, max: 60 }, bio: { type: 'string', max: 300 },
      linkedinUrl: { type: 'string', max: 200 },
      language: { type: 'string', enum: ['ar', 'en', 'tr', 'es'] }, theme: { type: 'string', enum: ['teal', 'indigo', 'rose', 'amber', 'forest', 'night'] },
    }, ctx.body);
    assertClean(d.name, d.bio);
    // LinkedIn profile link: only real linkedin.com/in/… or /company/… addresses; empty string removes it
    if (ctx.body.linkedinUrl === '' || ctx.body.linkedinUrl === null) run('UPDATE users SET linkedin_url = NULL WHERE id = ?', ctx.user.id);
    else if (d.linkedinUrl !== undefined) {
      let url = d.linkedinUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (!/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(in|company)\/[A-Za-z0-9\-_%.]+\/?$/i.test(url.replace(/^http:/i, 'https:'))) throw new HttpError(400, 'VALIDATION_ERROR', { linkedinUrl: 'invalid' });
      run('UPDATE users SET linkedin_url = ? WHERE id = ?', url.replace(/^http:/i, 'https:'), ctx.user.id);
    }
    delete d.linkedinUrl;
    const sets = Object.keys(d).filter((k) => d[k] !== undefined);
    if (sets.length) run(`UPDATE users SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...sets.map((k) => d[k]), ctx.user.id);
    return S.me(one('SELECT * FROM users WHERE id = ?', ctx.user.id), ctx.base);
  });

  r.post('/api/me/avatar', requireAuth, (ctx) => {
    const f = ctx.files[0];
    if (!f) throw new HttpError(400, 'NO_FILE');
    const name = saveUpload(f, 'image', uploadDir);
    const old = ctx.user.avatar_url;
    run('UPDATE users SET avatar_url = ? WHERE id = ?', name, ctx.user.id);
    if (old && !/^https?:/.test(old)) fs.rm(path.join(uploadDir, old), () => {});
    return S.me(one('SELECT * FROM users WHERE id = ?', ctx.user.id), ctx.base);
  });

  r.post('/api/me/push-token', requireAuth, (ctx) => {
    const token = ctx.body.token ? String(ctx.body.token).slice(0, 300) : null;
    if (token) run('UPDATE users SET push_token = NULL WHERE push_token = ? AND id <> ?', token, ctx.user.id);
    run('UPDATE users SET push_token = ? WHERE id = ?', token, ctx.user.id);
    return { ok: true };
  });

  r.get('/api/me/subscriptions', requireAuth, (ctx) =>
    all('SELECT category_id FROM subscriptions WHERE user_id = ?', ctx.user.id).map((s) => s.category_id));

  r.put('/api/me/subscriptions', requireAuth, (ctx) => {
    const ids = Array.isArray(ctx.body.categoryIds) ? ctx.body.categoryIds.map(Number).filter(Number.isInteger) : null;
    if (!ids) throw new HttpError(400, 'VALIDATION_ERROR', { categoryIds: 'required' });
    tx(() => {
      run('DELETE FROM subscriptions WHERE user_id = ?', ctx.user.id);
      for (const cid of ids) if (one('SELECT 1 FROM categories WHERE id = ?', cid)) run('INSERT INTO subscriptions (user_id, category_id) VALUES (?,?)', ctx.user.id, cid);
    });
    return all('SELECT category_id FROM subscriptions WHERE user_id = ?', ctx.user.id).map((s) => s.category_id);
  });

  r.get('/api/me/blocked', requireAuth, (ctx) =>
    all('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC', ctx.user.id)
      .map((u) => S.user(u, ctx.base)));

  // Permanently deletes the account and everything it created
  r.delete('/api/me', requireAuth, (ctx) => {
    const files = all('SELECT media_url FROM posts WHERE user_id = ? AND media_url IS NOT NULL', ctx.user.id).map((p) => p.media_url);
    if (ctx.user.avatar_url) files.push(ctx.user.avatar_url);
    run('DELETE FROM users WHERE id = ?', ctx.user.id);
    files.filter((f) => !/^https?:/.test(f)).forEach((f) => fs.rm(path.join(uploadDir, f), () => {}));
    return { ok: true };
  });
};
