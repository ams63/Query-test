// Public question pages (rich link previews on WhatsApp, Facebook, X, Snapchat, Telegram…),
// app links so shared links open inside the app, and the Meta integrations.
const fs = require('node:fs');
const path = require('node:path');
const { one, all } = require('../db');
const { HttpError, serveFile, send } = require('../lib/http');
const meta = require('../lib/meta');
const linkedin = require('../lib/linkedin');

const LANGS = ['ar', 'en', 'tr', 'es'];
const T = {
  ar: { open: 'افتح في التطبيق', get: 'حمّل Query', answers: 'إجابات', best: 'أفضل إجابة', anon: 'مجهول', noAns: 'لا توجد إجابات بعد — كن أول من يجيب في التطبيق.', notFound: 'هذا السؤال غير متاح.', stars: 'تقييم' },
  en: { open: 'Open in the app', get: 'Get Query', answers: 'answers', best: 'Best answer', anon: 'Anonymous', noAns: 'No answers yet — be the first to answer in the app.', notFound: 'This question is not available.', stars: 'rating' },
  tr: { open: 'Uygulamada aç', get: "Query'yi indir", answers: 'cevap', best: 'En iyi cevap', anon: 'Anonim', noAns: 'Henüz cevap yok — uygulamada ilk cevaplayan siz olun.', notFound: 'Bu soru mevcut değil.', stars: 'puan' },
  es: { open: 'Abrir en la app', get: 'Descargar Query', answers: 'respuestas', best: 'Mejor respuesta', anon: 'Anónimo', noAns: 'Aún no hay respuestas: responde primero en la app.', notFound: 'Esta pregunta no está disponible.', stars: 'valoración' },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pickLang = (ctx) => (LANGS.includes(ctx.query.lang) ? ctx.query.lang
  : (LANGS.find((l) => String(ctx.req.headers['accept-language'] || '').toLowerCase().startsWith(l)) || 'ar'));
const publicDir = path.join(__dirname, '..', '..', 'public');

module.exports = (r, { requireAuth, uploadDir }) => {
  r.get('/og-image.png', async (ctx) => { await serveFile(ctx.req, ctx.res, path.join(publicDir, 'og-image.png')); });
  r.get('/icon.png', async (ctx) => { await serveFile(ctx.req, ctx.res, path.join(publicDir, 'icon.png')); });

  // Universal Links (iOS) and App Links (Android): https://your-domain/q/<id> opens the app when installed
  r.get('/.well-known/apple-app-site-association', (ctx) => send(ctx.res, 200, {
    applinks: { details: [{ appIDs: [`${process.env.APPLE_TEAM_ID || 'TEAMID'}.${process.env.IOS_BUNDLE_ID || 'com.query.app'}`], components: [{ '/': '/q/*' }, { '/': '/i/*' }] }] },
  }));
  r.get('/.well-known/assetlinks.json', (ctx) => send(ctx.res, 200, [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'com.query.app', sha256_cert_fingerprints: String(process.env.ANDROID_SHA256 || '').split(',').filter(Boolean) },
  }]));

  r.get('/q/:id', (ctx) => {
    const l = pickLang(ctx);
    const t = T[l];
    const p = one(`SELECT p.*, u.name AS u_name, c.name_ar, c.name_en, c.name_tr, c.name_es, c.color, c.key AS c_key
      FROM posts p JOIN users u ON u.id = p.user_id JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.hidden = 0`, ctx.params.id);
    const url = `${ctx.base}/q/${ctx.params.id}`;
    const appUrl = `query://post/${ctx.params.id}`;
    const store = process.env.APP_DOWNLOAD_URL || ctx.base;
    let head; let body;
    if (!p) {
      head = `<title>Query</title><meta name="robots" content="noindex">`;
      body = `<p>${esc(t.notFound)}</p>`;
    } else {
      const catName = { ar: p.name_ar, en: p.name_en, tr: p.name_tr, es: p.name_es }[l] || p.name_en;
      const author = p.is_anonymous ? t.anon : p.u_name;
      const title = p.product_name ? `${'★'.repeat(p.rating || 0)} ${p.product_name}` : (p.content || catName).slice(0, 90);
      const answers = all(`SELECT m.content, u.name FROM comments m JOIN users u ON u.id = m.user_id WHERE m.post_id = ? AND m.hidden = 0
        ORDER BY (m.id = ?) DESC, m.created_at ASC LIMIT 5`, p.id, p.best_comment_id || '');
      const count = one('SELECT COUNT(*) AS n FROM comments WHERE post_id = ? AND hidden = 0', p.id).n;
      const image = p.type === 'IMAGE' && p.media_url ? (/^https?:/.test(p.media_url) ? p.media_url : `${ctx.base}/uploads/${p.media_url}`) : `${ctx.base}/og-image.png`;
      const desc = `${catName} · ${count} ${t.answers} · Query`;
      head = `<title>${esc(title)} — Query</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Query">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:image" content="${esc(image)}">
<meta property="al:android:url" content="${appUrl}"><meta property="al:android:package" content="${esc(process.env.ANDROID_PACKAGE || 'com.query.app')}">
<meta property="al:ios:url" content="${appUrl}"><link rel="canonical" href="${esc(url)}">`;
      const review = p.product_name ? `<p class="stars" aria-label="${p.rating}/5">${'★'.repeat(p.rating)}${'☆'.repeat(5 - p.rating)} <b>${esc(p.product_name)}</b></p>` : '';
      body = `<p class="meta"><span class="dot" style="background:${esc(p.color)}"></span>${esc(catName)} · ${esc(author)}</p>${review}
<h1>${esc(p.content)}</h1>
${p.type === 'IMAGE' && p.media_url ? `<img src="${esc(image)}" alt="">` : ''}
<h2>${count} ${esc(t.answers)}</h2>
${answers.length ? answers.map((a, i) => `<div class="ans">${i === 0 && p.best_comment_id ? `<span class="best">✓ ${esc(t.best)}</span>` : ''}<b>${esc(a.name)}</b><p>${esc(a.content)}</p></div>`).join('') : `<p class="muted">${esc(t.noAns)}</p>`}`;
    }
    const html = `<!doctype html><html lang="${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${head}<style>
:root{--p:#0891B2;--ink:#15202B;--muted:#65758A;--bg:#F4F6F8;--card:#fff;--line:#E1E7ED}
@media (prefers-color-scheme:dark){:root{--p:#5CC2D6;--ink:#E7EDF3;--muted:#8C9DB0;--bg:#0E151C;--card:#17212B;--line:#24313E}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:680px;margin:0 auto;padding:20px 16px 110px}.brand{font-size:26px;font-weight:800;color:var(--p);text-decoration:none;direction:ltr;unicode-bidi:isolate}.brand span{color:#F5A623}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-top:14px}h1{font-size:21px;line-height:1.6;margin:6px 0}h2{font-size:16px;margin:18px 0 8px}
.meta,.muted{color:var(--muted);font-size:14px}.dot{display:inline-block;width:9px;height:9px;border-radius:5px;margin-inline-end:6px}img{max-width:100%;border-radius:14px}
.ans{border-top:1px solid var(--line);padding:10px 0}.ans p{margin:4px 0}.best{display:inline-block;color:#16A34A;font-size:13px;font-weight:700;margin-inline-end:8px}.stars{color:#F5A623;font-size:20px;margin:4px 0}
.bar{position:fixed;inset-inline:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);border-top:1px solid var(--line);display:flex;gap:10px;max-width:680px;margin:0 auto}
.bar a{flex:1;text-align:center;padding:13px;border-radius:14px;font-weight:700;text-decoration:none}.open{background:var(--p);color:#fff}.get{border:1.5px solid var(--p);color:var(--p)}
</style></head><body><main><a class="brand" href="${esc(ctx.base)}">Query<span>?</span></a><div class="card">${body}</div></main>
<nav class="bar"><a class="open" href="${appUrl}">${esc(t.open)}</a><a class="get" href="${esc(store)}">${esc(t.get)}</a></nav></body></html>`;
    ctx.res.writeHead(p ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=120', 'X-Content-Type-Options': 'nosniff' });
    ctx.res.end(html);
  });

  // ---- Meta (Facebook Page / Instagram / WhatsApp) — off until configured ----
  r.get('/api/admin/meta/status', requireAuth, (ctx) => { if (!ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN'); return { ...meta.channels(), linkedin: linkedin.configured() }; });
  r.post('/api/admin/meta/share-daily', requireAuth, async (ctx) => {
    if (!ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN');
    return meta.shareQuestionOfDay(ctx.base);
  });
  r.post('/api/admin/linkedin/share', requireAuth, async (ctx) => {
    if (!ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN');
    return linkedin.shareToLinkedIn(ctx.base);
  });
  r.get('/webhooks/meta', (ctx) => {
    const q = ctx.query;
    if (q['hub.mode'] === 'subscribe' && process.env.META_VERIFY_TOKEN && q['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
      ctx.res.writeHead(200, { 'Content-Type': 'text/plain' });
      return ctx.res.end(String(q['hub.challenge'] || ''));
    }
    throw new HttpError(403, 'FORBIDDEN');
  });
  r.post('/webhooks/meta', async (ctx) => {
    if (!meta.validSignature(ctx.req.rawBody, ctx.req.headers['x-hub-signature-256'])) throw new HttpError(401, 'BAD_SIGNATURE');
    try { return { ok: true, sent: (await meta.handleWebhook(ctx.body, ctx.base)).length }; } catch (e) { console.warn('[webhook]', e.message); return { ok: true, sent: 0 }; }
  });
};
