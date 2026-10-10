// Search-engine traffic: every public question and category is a real web page Google can index,
// plus a landing page, sitemap.xml and robots.txt. People searching Google find answers → install the app.
const { one, all } = require('../db');

const LANGS = ['ar', 'en', 'tr', 'es'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nameOf = (c, l) => ({ ar: c.name_ar, en: c.name_en, tr: c.name_tr, es: c.name_es }[l] || c.name_en);
const T = {
  ar: { tag: 'اسأل، أجب، وتعلّم من الناس حولك', latest: 'أحدث الأسئلة', cats: 'الأقسام', get: 'حمّل Query مجاناً', answers: 'إجابات', q: 'سؤال', ask: 'اسأل في هذا القسم' },
  en: { tag: 'Ask, answer, and learn from people around you', latest: 'Latest questions', cats: 'Categories', get: 'Get Query free', answers: 'answers', q: 'questions', ask: 'Ask in this category' },
  tr: { tag: 'Sor, cevapla ve çevrendeki insanlardan öğren', latest: 'Son sorular', cats: 'Kategoriler', get: "Query'yi ücretsiz indir", answers: 'cevap', q: 'soru', ask: 'Bu kategoride sor' },
  es: { tag: 'Pregunta, responde y aprende de la gente que te rodea', latest: 'Últimas preguntas', cats: 'Categorías', get: 'Descarga Query gratis', answers: 'respuestas', q: 'preguntas', ask: 'Pregunta en esta categoría' },
};
const pick = (ctx) => (LANGS.includes(ctx.query.lang) ? ctx.query.lang : LANGS.find((l) => String(ctx.req.headers['accept-language'] || '').toLowerCase().startsWith(l)) || 'ar');

function shell(ctx, l, title, desc, body) {
  const t = T[l];
  const banner = process.env.IOS_APP_ID ? `<meta name="apple-itunes-app" content="app-id=${esc(process.env.IOS_APP_ID)}">` : '';
  return `<!doctype html><html lang="${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">${banner}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${ctx.base}/og-image.png">
${LANGS.map((x) => `<link rel="alternate" hreflang="${x}" href="${ctx.base}${ctx.req.pathname}?lang=${x}">`).join('')}
<style>:root{--p:#0891B2;--ink:#15202B;--muted:#65758A;--bg:#F4F6F8;--card:#fff;--line:#E1E7ED}
@media (prefers-color-scheme:dark){:root{--p:#5CC2D6;--ink:#E7EDF3;--muted:#8C9DB0;--bg:#0E151C;--card:#17212B;--line:#24313E}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}main{max-width:760px;margin:0 auto;padding:18px 16px 110px}
header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.b{font-size:28px;font-weight:800;color:var(--p);text-decoration:none;direction:ltr;unicode-bidi:isolate}.b span{color:#F5A623}
nav a{color:var(--p);font-size:14px;margin-inline-start:8px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.cat{display:block;border-radius:18px;padding:14px;color:#fff;text-decoration:none;font-weight:700;min-height:70px}.cat small{display:block;font-weight:400;opacity:.9}
.q{display:block;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin:10px 0;color:var(--ink);text-decoration:none}.q small{color:var(--muted)}
.cta{position:fixed;inset-inline:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);border-top:1px solid var(--line);text-align:center}
.cta a{display:inline-block;max-width:420px;width:100%;padding:13px;border-radius:14px;background:var(--p);color:#fff;font-weight:700;text-decoration:none}</style></head>
<body><main><header><a class="b" href="/?lang=${l}">Query<span>?</span></a><nav>${LANGS.map((x) => `<a href="?lang=${x}">${x.toUpperCase()}</a>`).join('')}</nav></header>${body}</main>
<div class="cta"><a href="/go?src=web">${esc(t.get)}</a></div></body></html>`;
}
const send = (ctx, html, status = 200) => { ctx.res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' }); ctx.res.end(html); };
const qItem = (p, l, t) => `<a class="q" href="/q/${p.id}?lang=${l}"><b>${esc((p.product_name ? `★${p.rating} ${p.product_name} — ` : '') + (p.content || '').slice(0, 140))}</b><br><small>${esc(nameOf(p, l))} · ${p.answers} ${esc(t.answers)}</small></a>`;
const Q_SQL = `SELECT p.id, p.content, p.product_name, p.rating, c.name_ar, c.name_en, c.name_tr, c.name_es,
  (SELECT COUNT(*) FROM comments m WHERE m.post_id = p.id AND m.hidden = 0) AS answers
  FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.hidden = 0`;

module.exports = (r) => {
  r.get('/', (ctx) => {
    const l = pick(ctx); const t = T[l];
    const cats = all('SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.category_id = c.id AND p.hidden = 0) AS n FROM categories c ORDER BY sort');
    const latest = all(`${Q_SQL} ORDER BY p.created_at DESC LIMIT 20`);
    send(ctx, shell(ctx, l, `Query — ${t.tag}`, t.tag, `<p style="font-size:18px">${esc(t.tag)}</p><h2>${esc(t.cats)}</h2>
      <div class="grid">${cats.map((c) => `<a class="cat" style="background:${esc(c.color)}" href="/c/${c.key}?lang=${l}">${esc(nameOf(c, l))}<small>${c.n} ${esc(t.q)}</small></a>`).join('')}</div>
      <h2>${esc(t.latest)}</h2>${latest.map((p) => qItem(p, l, t)).join('')}`));
  });

  r.get('/c/:key', (ctx) => {
    const l = pick(ctx); const t = T[l];
    const c = one('SELECT * FROM categories WHERE key = ?', ctx.params.key);
    if (!c) return send(ctx, shell(ctx, l, 'Query', '', '<p>404</p>'), 404);
    const qs = all(`${Q_SQL} AND p.category_id = ? ORDER BY p.created_at DESC LIMIT 100`, c.id);
    const n = nameOf(c, l);
    return send(ctx, shell(ctx, l, `${n} — Query`, `${n}: ${t.tag}`, `<h1 style="color:${esc(c.color)}">${esc(n)}</h1>${qs.map((p) => qItem(p, l, t)).join('')}
      <p><a href="/go?src=web&c=" style="color:var(--p);font-weight:700">${esc(t.ask)} →</a></p>`));
  });

  r.get('/robots.txt', (ctx) => {
    ctx.res.writeHead(200, { 'Content-Type': 'text/plain' });
    ctx.res.end(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /studio\nDisallow: /delete-account\nSitemap: ${ctx.base}/sitemap.xml\n`);
  });

  r.get('/sitemap.xml', (ctx) => {
    const cats = all('SELECT key FROM categories');
    const qs = all(`SELECT id, created_at FROM posts WHERE hidden = 0 AND is_anonymous = 0 ORDER BY created_at DESC LIMIT 45000`);
    const url = (loc, mod) => `<url><loc>${esc(loc)}</loc>${mod ? `<lastmod>${mod.slice(0, 10)}</lastmod>` : ''}</url>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${url(`${ctx.base}/`)}${cats.map((c) => url(`${ctx.base}/c/${c.key}`)).join('')}${qs.map((q) => url(`${ctx.base}/q/${q.id}`, q.created_at)).join('')}</urlset>`;
    ctx.res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    ctx.res.end(xml);
  });
};
