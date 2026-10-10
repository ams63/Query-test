// Categories, public user profiles, blocking, notifications, admin moderation
const { db, one, all, run } = require('../db');
const { HttpError } = require('../lib/http');
const S = require('../lib/serialize');
const { notify } = require('../lib/notify');

const STRIKES_TO_BAN = Number(process.env.STRIKES_TO_BAN || 3);
const DAY = 86400e3;

module.exports = (r, { requireAuth, optionalAuth }) => {
  r.get('/api/categories', optionalAuth, (ctx) => {
    const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id AND p.hidden = 0) AS post_count
      ${ctx.user ? ', EXISTS(SELECT 1 FROM subscriptions s WHERE s.category_id = c.id AND s.user_id = $viewer) AS subscribed' : ''}
      FROM categories c ORDER BY c.sort, c.id`).all(ctx.user ? { viewer: ctx.user.id } : {});
    return rows.map(S.category);
  });

  r.get('/api/users/:id', optionalAuth, (ctx) => {
    const u = one('SELECT * FROM users WHERE id = ?', ctx.params.id);
    if (!u) throw new HttpError(404, 'NOT_FOUND');
    const counts = one(`SELECT (SELECT COUNT(*) FROM posts WHERE user_id = ? AND is_anonymous = 0 AND hidden = 0) AS questions,
      (SELECT COUNT(*) FROM comments WHERE user_id = ? AND hidden = 0) AS answers,
      (SELECT COUNT(*) FROM posts WHERE best_comment_id IN (SELECT id FROM comments WHERE user_id = ?)) AS best_answers`, u.id, u.id, u.id);
    return {
      ...S.user(u, ctx.base), joinedAt: u.created_at,
      stats: { questions: counts.questions, answers: counts.answers, bestAnswers: counts.best_answers },
      blocked: ctx.user ? !!one('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', ctx.user.id, u.id) : false,
    };
  });

  r.post('/api/users/:id/block', requireAuth, (ctx) => {
    if (ctx.params.id === ctx.user.id) throw new HttpError(400, 'CANNOT_BLOCK_SELF');
    if (!one('SELECT 1 FROM users WHERE id = ?', ctx.params.id)) throw new HttpError(404, 'NOT_FOUND');
    run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?,?)', ctx.user.id, ctx.params.id);
    return { ok: true };
  });
  r.delete('/api/users/:id/block', requireAuth, (ctx) => {
    run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', ctx.user.id, ctx.params.id);
    return { ok: true };
  });

  r.get('/api/notifications', requireAuth, (ctx) => {
    const page = Math.max(1, parseInt(ctx.query.page, 10) || 1);
    const rows = all(`SELECT n.*, u.name AS a_name, u.avatar_url AS a_avatar FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 31 OFFSET ?`, ctx.user.id, (page - 1) * 30);
    return {
      items: rows.slice(0, 30).map((n) => ({
        id: n.id, type: n.type, text: n.text, postId: n.post_id, read: !!n.read, createdAt: n.created_at,
        actor: n.actor_id && n.type !== 'newPost' ? { id: n.actor_id, name: n.a_name, avatarUrl: S.mediaUrl(ctx.base, n.a_avatar) } : null,
      })),
      page, hasMore: rows.length > 30,
    };
  });
  r.post('/api/notifications/read-all', requireAuth, (ctx) => {
    run('UPDATE notifications SET read = 1 WHERE user_id = ?', ctx.user.id);
    return { ok: true };
  });

  // ---- Admin: review reported content ----
  const requireAdmin = (ctx) => { if (!ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN'); };
  r.get('/api/admin/reports', requireAuth, requireAdmin, () => all(`SELECT target_type AS type, target_id AS id, COUNT(*) AS reports,
      MAX(created_at) AS last_at, GROUP_CONCAT(reason, ' | ') AS reasons,
      CASE target_type WHEN 'post' THEN (SELECT content FROM posts WHERE id = target_id) ELSE (SELECT content FROM comments WHERE id = target_id) END AS content,
      CASE target_type WHEN 'post' THEN (SELECT user_id FROM posts WHERE id = target_id) ELSE (SELECT user_id FROM comments WHERE id = target_id) END AS author_id,
      SUM(CASE WHEN reason IN ('sexual','religion') THEN 1 ELSE 0 END) AS severe
    FROM reports WHERE resolved = 0 GROUP BY target_type, target_id ORDER BY reports DESC`));
  r.post('/api/admin/:type/:id/restore', requireAuth, requireAdmin, (ctx) => {
    const table = ctx.params.type === 'post' ? 'posts' : ctx.params.type === 'comment' ? 'comments' : null;
    if (!table) throw new HttpError(400, 'VALIDATION_ERROR');
    run(`UPDATE ${table} SET hidden = 0 WHERE id = ?`, ctx.params.id);
    run('UPDATE reports SET resolved = 1 WHERE target_type = ? AND target_id = ?', ctx.params.type, ctx.params.id);
    return { ok: true };
  });
  // Remove content; the author gets a strike and is suspended automatically after STRIKES_TO_BAN strikes.
  // body.ban: 'none' | '7d' | '30d' | 'permanent' lets the admin suspend right away.
  r.post('/api/admin/:type/:id/remove', requireAuth, requireAdmin, (ctx) => {
    const table = ctx.params.type === 'post' ? 'posts' : ctx.params.type === 'comment' ? 'comments' : null;
    if (!table) throw new HttpError(400, 'VALIDATION_ERROR');
    const row = one(`SELECT user_id FROM ${table} WHERE id = ?`, ctx.params.id);
    run(`DELETE FROM ${table} WHERE id = ?`, ctx.params.id);
    run('UPDATE reports SET resolved = 1 WHERE target_type = ? AND target_id = ?', ctx.params.type, ctx.params.id);
    let bannedUntil = null;
    if (row) {
      run('UPDATE users SET strikes = strikes + 1 WHERE id = ?', row.user_id);
      const u = one('SELECT strikes FROM users WHERE id = ?', row.user_id);
      const ban = String(ctx.body.ban || 'none');
      if (ban === 'permanent') bannedUntil = 8.64e15;
      else if (ban === '30d' || u.strikes >= STRIKES_TO_BAN) bannedUntil = Date.now() + 30 * DAY;
      else if (ban === '7d') bannedUntil = Date.now() + 7 * DAY;
      if (bannedUntil) run('UPDATE users SET banned_until = MAX(COALESCE(banned_until, 0), ?) WHERE id = ?', bannedUntil, row.user_id);
      notify(row.user_id, 'removed');
    }
    return { ok: true, bannedUntil };
  });
  r.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, (ctx) => {
    const days = ctx.body.days === 'permanent' ? null : Number(ctx.body.days || 30);
    run('UPDATE users SET banned_until = ? WHERE id = ?', days ? Date.now() + days * DAY : 8.64e15, ctx.params.id);
    return { ok: true };
  });
  r.post('/api/admin/users/:id/unban', requireAuth, requireAdmin, (ctx) => {
    run('UPDATE users SET banned_until = NULL, strikes = 0 WHERE id = ?', ctx.params.id);
    return { ok: true };
  });
};
