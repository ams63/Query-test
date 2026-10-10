// Growth: my points/level/badges/invite link, leaderboards, smart links with source tracking,
// invite landing pages, admin campaigns (influencers / ads) and growth stats.
const { one, all, run } = require('../db');
const { HttpError } = require('../lib/http');
const { check } = require('../lib/validate');
const S = require('../lib/serialize');
const G = require('../lib/growth');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const osOf = (ua) => (/iphone|ipad|ipod/i.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : 'web');
const storeFor = (os, base) => (os === 'ios' ? process.env.IOS_STORE_URL : os === 'android' ? process.env.ANDROID_STORE_URL : null) || base;

module.exports = (r, { requireAuth, optionalAuth }) => {
  r.get('/api/me/growth', requireAuth, (ctx) => {
    const s = G.statsFor(ctx.user.id);
    const code = G.ensureInviteCode(ctx.user.id);
    return { ...s, level: G.levelFor(s.points), badges: G.badgesFor(s), inviteCode: code, inviteLink: `${ctx.base}/i/${code}`, pointsTable: G.POINTS };
  });

  r.get('/api/users/:id/growth', optionalAuth, (ctx) => {
    if (!one('SELECT 1 FROM users WHERE id = ?', ctx.params.id)) throw new HttpError(404, 'NOT_FOUND');
    const s = G.statsFor(ctx.params.id);
    return { points: s.points, level: G.levelFor(s.points), badges: G.badgesFor(s) };
  });

  r.get('/api/leaderboard', optionalAuth, (ctx) => {
    const period = ['week', 'month', 'all'].includes(ctx.query.period) ? ctx.query.period : 'week';
    return G.leaderboard({ period, categoryId: ctx.query.category ? Number(ctx.query.category) : null })
      .map((u, i) => ({ rank: i + 1, id: u.id, name: u.name, avatarUrl: S.mediaUrl(ctx.base, u.avatar_url), points: u.points, answers: u.answers, best: u.best, level: G.levelFor(u.points).key, isMe: !!ctx.user && ctx.user.id === u.id }));
  });

  // Smart link for bios, ads and influencers: https://your-domain/go?src=instagram&c=CODE
  // Counts the click by source, then sends the visitor to the right store (or the web) for their phone.
  r.get('/go', (ctx) => {
    const os = osOf(ctx.req.headers['user-agent'] || '');
    const source = String(ctx.query.src || 'direct').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'direct';
    const campaign = ctx.query.c ? String(ctx.query.c).toUpperCase().slice(0, 20) : null;
    run('INSERT INTO link_clicks (source, campaign, os) VALUES (?,?,?)', source, campaign, os);
    const target = campaign ? `${ctx.base}/i/${encodeURIComponent(campaign)}?src=${source}` : storeFor(os, ctx.base);
    ctx.res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
    ctx.res.end();
  });

  // Invite landing page: rich preview ("Sara invites you to Query"), shows the code, opens/installs the app
  r.get('/i/:code', (ctx) => {
    const code = String(ctx.params.code).toUpperCase();
    const res = G.resolveCode(code);
    const lang = ['ar', 'en', 'tr', 'es'].find((l) => String(ctx.query.lang || ctx.req.headers['accept-language'] || '').toLowerCase().startsWith(l)) || 'ar';
    const T = {
      ar: [res.inviterName ? `${res.inviterName} يدعوك إلى Query` : 'انضم إلى Query', 'اسأل أي سؤال واحصل على إجابات من أناس يعرفون. استخدم كود الدعوة عند التسجيل:', 'افتح التطبيق', 'حمّل التطبيق'],
      en: [res.inviterName ? `${res.inviterName} invites you to Query` : 'Join Query', 'Ask anything and get answers from people who know. Use this invite code when you sign up:', 'Open the app', 'Get the app'],
      tr: [res.inviterName ? `${res.inviterName} sizi Query'ye davet ediyor` : "Query'ye katılın", 'Her şeyi sorun, bilen insanlardan cevap alın. Kaydolurken bu davet kodunu kullanın:', 'Uygulamayı aç', 'Uygulamayı indir'],
      es: [res.inviterName ? `${res.inviterName} te invita a Query` : 'Únete a Query', 'Pregunta lo que quieras y recibe respuestas de gente que sabe. Usa este código al registrarte:', 'Abrir la app', 'Descargar la app'],
    }[lang];
    const os = osOf(ctx.req.headers['user-agent'] || '');
    const html = `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T[0])}</title><meta property="og:title" content="${esc(T[0])}"><meta property="og:description" content="${esc(T[1])} ${esc(code)}">
<meta property="og:image" content="${ctx.base}/og-image.png"><meta name="twitter:card" content="summary_large_image">
${process.env.IOS_APP_ID ? `<meta name="apple-itunes-app" content="app-id=${esc(process.env.IOS_APP_ID)}, app-argument=query://invite/${esc(code)}">` : ''}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0E7490;color:#fff;font:17px/1.7 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
.box{max-width:420px;margin:20px;text-align:center}.b{font-size:44px;font-weight:800;direction:ltr;unicode-bidi:isolate}.b span{color:#F5A623}
.code{display:inline-block;margin:10px 0 18px;padding:12px 22px;border-radius:14px;background:#fff;color:#0E7490;font-size:30px;font-weight:800;letter-spacing:4px;direction:ltr}
a{display:block;margin:10px 0;padding:14px;border-radius:14px;font-weight:700;text-decoration:none}.o{background:#F5A623;color:#15202B}.g{border:2px solid #fff;color:#fff}</style></head>
<body><div class="box"><div class="b">Query<span>?</span></div><h1 style="font-size:24px">${esc(T[0])}</h1><p>${esc(T[1])}</p><div class="code">${esc(code)}</div>
<a class="o" href="query://invite/${esc(code)}">${esc(T[2])}</a><a class="g" href="${esc(storeFor(os, ctx.base))}">${esc(T[3])}</a></div></body></html>`;
    ctx.res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    ctx.res.end(html);
  });

  // ---- Admin: campaigns for influencers / ads, and growth numbers ----
  const admin = (ctx) => { if (!ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN'); };
  r.post('/api/admin/campaigns', requireAuth, admin, (ctx) => {
    const d = check({ code: { type: 'string', required: true, min: 3, max: 20 }, name: { type: 'string', required: true, max: 80 } }, ctx.body);
    const code = d.code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (one('SELECT 1 FROM campaigns WHERE code = ?', code) || one('SELECT 1 FROM users WHERE invite_code = ?', code)) throw new HttpError(409, 'CODE_TAKEN');
    run('INSERT INTO campaigns (code, name) VALUES (?,?)', code, d.name);
    return { status: 201, data: { code, name: d.name, link: `${ctx.base}/go?src=campaign&c=${code}` } };
  });
  r.get('/api/admin/growth', requireAuth, admin, (ctx) => {
    const days = Math.min(Number(ctx.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    return {
      days,
      signups: one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', since).n,
      viaInvites: one('SELECT COUNT(*) n FROM users WHERE invited_by IS NOT NULL AND created_at >= ?', since).n,
      clicksBySource: all('SELECT source, os, COUNT(*) AS clicks FROM link_clicks WHERE created_at >= ? GROUP BY source, os ORDER BY clicks DESC', since),
      campaigns: all(`SELECT c.code, c.name, (SELECT COUNT(*) FROM link_clicks l WHERE l.campaign = c.code AND l.created_at >= ?) AS clicks,
        (SELECT COUNT(*) FROM users u WHERE u.campaign = c.code AND u.created_at >= ?) AS signups FROM campaigns c ORDER BY signups DESC`, since, since),
      topInviters: all(`SELECT u.name, COUNT(i.id) AS invites FROM users u JOIN users i ON i.invited_by = u.id AND i.created_at >= ?
        GROUP BY u.id ORDER BY invites DESC LIMIT 10`, since),
    };
  });
};
