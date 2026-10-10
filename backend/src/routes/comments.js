const { one, all, run, id } = require('../db');
const { check } = require('../lib/validate');
const { HttpError } = require('../lib/http');
const { notify } = require('../lib/notify');
const S = require('../lib/serialize');
const { assertClean } = require('../lib/moderation');
const { handleReport } = require('../lib/reports');

const PAGE = 30;
const visiblePost = (pid, viewer) => {
  const p = one('SELECT id, user_id, best_comment_id, hidden FROM posts WHERE id = ?', pid);
  if (!p || (p.hidden && (!viewer || p.user_id !== viewer.id))) throw new HttpError(404, 'NOT_FOUND');
  return p;
};
const loadComment = (cid) => one(`SELECT c.*, u.name AS u_name, u.avatar_url AS u_avatar, u.linkedin_url AS u_linkedin, EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id = c.user_id AND i.provider = 'linkedin') AS u_li_verified FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, cid);

module.exports = (r, { requireAuth, optionalAuth }) => {
  // Oldest first so the conversation reads naturally; the best answer is pinned on top
  r.get('/api/posts/:id/comments', optionalAuth, (ctx) => {
    const viewer = ctx.user;
    const p = visiblePost(ctx.params.id, viewer);
    const page = Math.max(1, parseInt(ctx.query.page, 10) || 1);
    const rows = all(`SELECT c.*, u.name AS u_name, u.avatar_url AS u_avatar, u.linkedin_url AS u_linkedin, EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id = c.user_id AND i.provider = 'linkedin') AS u_li_verified FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ? AND c.hidden = 0 ${viewer ? 'AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)' : ''}
      ORDER BY (c.id = ?) DESC, c.created_at ASC LIMIT ? OFFSET ?`,
    ...(viewer ? [p.id, viewer.id] : [p.id]), p.best_comment_id || '', PAGE + 1, (page - 1) * PAGE);
    return {
      items: rows.slice(0, PAGE).map((c) => S.comment(c, viewer && viewer.id, p.user_id, ctx.base)),
      page, hasMore: rows.length > PAGE,
    };
  });

  r.post('/api/posts/:id/comments', requireAuth, (ctx) => {
    const p = visiblePost(ctx.params.id, ctx.user);
    if (one('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?', p.user_id, ctx.user.id)) throw new HttpError(403, 'BLOCKED');
    const d = check({ content: { type: 'string', required: true, min: 1, max: 2000 } }, ctx.body);
    assertClean(d.content);
    const cid = id();
    run('INSERT INTO comments (id, post_id, user_id, content) VALUES (?,?,?,?)', cid, p.id, ctx.user.id, d.content);
    if (p.user_id !== ctx.user.id) notify(p.user_id, 'comment', { actorId: ctx.user.id, postId: p.id, vars: { name: ctx.user.name }, preview: d.content });
    return { status: 201, data: S.comment(loadComment(cid), ctx.user.id, p.user_id, ctx.base) };
  });

  r.patch('/api/comments/:id', requireAuth, (ctx) => {
    const c = loadComment(ctx.params.id);
    if (!c) throw new HttpError(404, 'NOT_FOUND');
    if (c.user_id !== ctx.user.id) throw new HttpError(403, 'FORBIDDEN');
    const d = check({ content: { type: 'string', required: true, min: 1, max: 2000 } }, ctx.body);
    assertClean(d.content);
    run("UPDATE comments SET content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", d.content, c.id);
    const p = one('SELECT user_id FROM posts WHERE id = ?', c.post_id);
    return S.comment(loadComment(c.id), ctx.user.id, p.user_id, ctx.base);
  });

  // Comment author or the question's author (moderating answers on their question)
  r.delete('/api/comments/:id', requireAuth, (ctx) => {
    const c = one('SELECT c.id, c.user_id, c.post_id, p.user_id AS owner FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?', ctx.params.id);
    if (!c) throw new HttpError(404, 'NOT_FOUND');
    if (c.user_id !== ctx.user.id && c.owner !== ctx.user.id && !ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN');
    run('DELETE FROM comments WHERE id = ?', c.id);
    run('UPDATE posts SET best_comment_id = NULL WHERE id = ? AND best_comment_id = ?', c.post_id, c.id);
    return { ok: true };
  });

  r.post('/api/comments/:id/report', requireAuth, (ctx) => {
    const c = one('SELECT id, user_id FROM comments WHERE id = ?', ctx.params.id);
    if (!c) throw new HttpError(404, 'NOT_FOUND');
    if (c.user_id === ctx.user.id) throw new HttpError(400, 'CANNOT_REPORT_OWN');
    handleReport({ table: 'comments', type: 'comment', targetId: c.id, reporterId: ctx.user.id, reason: String(ctx.body.reason || '').slice(0, 300) });
    return { ok: true };
  });
};
