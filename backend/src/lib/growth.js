// Growth engine: points, levels, badges, leaderboards and invite codes.
// Points are computed from what people actually did, so they can't drift or be edited by hand.
const crypto = require('node:crypto');
const { one, all, run } = require('../db');

const POINTS = { question: 2, answer: 5, best: 15, like: 1, invite: 20 };
const LEVELS = [[0, 'beginner'], [50, 'active'], [200, 'expert'], [600, 'master'], [1500, 'legend']];

function statsFor(userId, since) {
  const t = since ? 'AND created_at >= ?' : '';
  const a = (sql) => one(sql, ...(since ? [userId, since] : [userId])).n;
  const questions = a(`SELECT COUNT(*) n FROM posts WHERE user_id = ? AND hidden = 0 ${t}`);
  const answers = a(`SELECT COUNT(*) n FROM comments WHERE user_id = ? AND hidden = 0 ${t}`);
  const best = a(`SELECT COUNT(*) n FROM comments c WHERE c.user_id = ? AND c.id IN (SELECT best_comment_id FROM posts WHERE best_comment_id IS NOT NULL) ${t.replace('created_at', 'c.created_at')}`);
  const likes = one(`SELECT COUNT(*) n FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.user_id = ? AND l.user_id <> p.user_id ${since ? 'AND p.created_at >= ?' : ''}`, ...(since ? [userId, since] : [userId])).n;
  const invites = a(`SELECT COUNT(*) n FROM users WHERE invited_by = ? ${t}`);
  const points = questions * POINTS.question + answers * POINTS.answer + best * POINTS.best + likes * POINTS.like + invites * POINTS.invite;
  return { questions, answers, best, likes, invites, points };
}

function levelFor(points) {
  let i = 0;
  LEVELS.forEach(([min], k) => { if (points >= min) i = k; });
  const next = LEVELS[i + 1];
  return { key: LEVELS[i][1], index: i + 1, nextAt: next ? next[0] : null, progress: next ? (points - LEVELS[i][0]) / (next[0] - LEVELS[i][0]) : 1 };
}

function badgesFor(s) {
  const b = [];
  if (s.questions >= 1) b.push('firstQuestion');
  if (s.answers >= 1) b.push('firstAnswer');
  if (s.best >= 1) b.push('bestAnswer');
  if (s.best >= 10) b.push('bestAnswer10');
  if (s.answers >= 50) b.push('helper50');
  if (s.invites >= 3) b.push('ambassador');
  if (s.invites >= 10) b.push('ambassador10');
  if (s.likes >= 100) b.push('loved100');
  return b;
}

// Leaderboard for a period ("week" | "month" | "all"), optionally for one category
function leaderboard({ period = 'week', categoryId = null, limit = 20 } = {}) {
  const since = period === 'all' ? null : new Date(Date.now() - (period === 'month' ? 30 : 7) * 86400e3).toISOString();
  // candidates: anyone who answered/asked in the period (keeps it fast)
  const cand = all(`SELECT DISTINCT u.id, u.name, u.avatar_url FROM users u
    WHERE u.banned_until IS NULL AND (EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.user_id = u.id ${since ? 'AND c.created_at >= $s' : ''} ${categoryId ? 'AND p.category_id = $c' : ''})
      OR EXISTS (SELECT 1 FROM posts p WHERE p.user_id = u.id AND p.is_anonymous = 0 ${since ? 'AND p.created_at >= $s' : ''} ${categoryId ? 'AND p.category_id = $c' : ''}))
    LIMIT 500`.replace(/\$s/g, since ? `'${since}'` : '').replace(/\$c/g, categoryId ? String(Number(categoryId)) : ''));
  return cand.map((u) => ({ ...u, ...statsFor(u.id, since) }))
    .filter((u) => u.points > 0).sort((a, b) => b.points - a.points).slice(0, limit);
}

function ensureInviteCode(userId) {
  const u = one('SELECT invite_code FROM users WHERE id = ?', userId);
  if (u && u.invite_code) return u.invite_code;
  for (;;) {
    const code = crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, '').toUpperCase().slice(0, 6);
    if (code.length === 6 && !one('SELECT 1 FROM users WHERE invite_code = ?', code) && !one('SELECT 1 FROM campaigns WHERE code = ?', code)) {
      run('UPDATE users SET invite_code = ? WHERE id = ?', code, userId);
      return code;
    }
  }
}

// Resolve a code typed/received at sign-up: a friend's invite code, or an influencer/ad campaign code
function resolveCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return {};
  const inviter = one('SELECT id, name FROM users WHERE invite_code = ?', c);
  if (inviter) return { invitedBy: inviter.id, inviterName: inviter.name };
  const camp = one('SELECT code FROM campaigns WHERE code = ?', c);
  return camp ? { campaign: camp.code } : {};
}

module.exports = { POINTS, LEVELS, statsFor, levelFor, badgesFor, leaderboard, ensureInviteCode, resolveCode };
