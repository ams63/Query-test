// Public web pages the app stores require: privacy policy URL, terms URL, and a web page to delete an account
// (Google Play requires account deletion to be possible from the web, not only inside the app).
const fs = require('node:fs');
const path = require('node:path');
const { one, all, run } = require('../db');
const { verifyPassword } = require('../lib/auth');
const legal = require('../content/legal.json');

const LANGS = ['ar', 'en', 'tr', 'es'];
const UI = {
  ar: { privacy: 'سياسة الخصوصية', terms: 'الشروط وقواعد المجتمع', del: 'حذف الحساب', tagline: 'اسأل، أجب، وتعلّم من الناس حولك',
    delIntro: 'أدخل بريدك وكلمة المرور لحذف حسابك وجميع أسئلتك وإجاباتك وملفاتك نهائياً. لا يمكن التراجع عن ذلك.',
    email: 'البريد الإلكتروني', password: 'كلمة المرور', delBtn: 'حذف حسابي نهائياً', done: 'تم حذف حسابك وكل بياناتك نهائياً.', socialNote: 'إن سجّلت بحساب Apple أو Google، احذف حسابك من داخل التطبيق (حسابي ← حذف الحساب) أو راسلنا على support@query-app.com.', wrong: 'البريد أو كلمة المرور غير صحيحة.' },
  en: { privacy: 'Privacy Policy', terms: 'Terms & community rules', del: 'Delete account', tagline: 'Ask, answer, and learn from people around you',
    delIntro: 'Enter your email and password to permanently delete your account and all your questions, answers and files. This cannot be undone.',
    email: 'Email', password: 'Password', delBtn: 'Permanently delete my account', done: 'Your account and all your data have been permanently deleted.', socialNote: 'If you signed up with Apple or Google, delete your account inside the app (Profile → Delete account) or email support@query-app.com.', wrong: 'Wrong email or password.' },
  tr: { privacy: 'Gizlilik Politikası', terms: 'Şartlar ve topluluk kuralları', del: 'Hesabı sil', tagline: 'Sor, cevapla ve çevrendeki insanlardan öğren',
    delIntro: 'Hesabınızı ve tüm sorularınızı, cevaplarınızı ve dosyalarınızı kalıcı olarak silmek için e-posta ve şifrenizi girin. Bu işlem geri alınamaz.',
    email: 'E-posta', password: 'Şifre', delBtn: 'Hesabımı kalıcı olarak sil', done: 'Hesabınız ve tüm verileriniz kalıcı olarak silindi.', socialNote: 'Apple veya Google ile kaydolduysanız, hesabınızı uygulama içinden silin (Profil → Hesabı sil) ya da support@query-app.com adresine yazın.', wrong: 'E-posta veya şifre hatalı.' },
  es: { privacy: 'Política de privacidad', terms: 'Condiciones y normas', del: 'Eliminar cuenta', tagline: 'Pregunta, responde y aprende de la gente que te rodea',
    delIntro: 'Introduce tu correo y contraseña para eliminar de forma permanente tu cuenta y todas tus preguntas, respuestas y archivos. No se puede deshacer.',
    email: 'Correo electrónico', password: 'Contraseña', delBtn: 'Eliminar mi cuenta para siempre', done: 'Tu cuenta y todos tus datos se han eliminado para siempre.', socialNote: 'Si te registraste con Apple o Google, elimina tu cuenta dentro de la app (Perfil → Eliminar cuenta) o escribe a support@query-app.com.', wrong: 'Correo o contraseña incorrectos.' },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pickLang(ctx) {
  if (LANGS.includes(ctx.query.lang)) return ctx.query.lang;
  const al = String(ctx.req.headers['accept-language'] || '').slice(0, 2).toLowerCase();
  return LANGS.includes(al) ? al : 'en';
}
// Paragraphs; a first line that is a numbered heading or ends with ":" becomes a heading
function toHtml(text) {
  return text.split('\n\n').map((para) => {
    const lines = para.split('\n');
    const head = /^([0-9١-٩]+\.\s.+|.+:)$/.test(lines[0].trim()) && lines.length > 1;
    const body = (head ? lines.slice(1) : lines).map(esc).join('<br>');
    return head ? `<h2>${esc(lines[0])}</h2><p>${body}</p>` : `<p>${body}</p>`;
  }).join('\n');
}
function page(res, lang, title, body) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const langs = LANGS.map((l) => `<a href="?lang=${l}"${l === lang ? ' aria-current="page"' : ''}>${{ ar: 'العربية', en: 'English', tr: 'Türkçe', es: 'Español' }[l]}</a>`).join(' · ');
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Query</title><style>
:root{--p:#0891B2;--ink:#15202B;--muted:#65758A;--bg:#F4F6F8;--card:#fff;--line:#E1E7ED}
@media (prefers-color-scheme:dark){:root{--p:#5CC2D6;--ink:#E7EDF3;--muted:#8C9DB0;--bg:#0E151C;--card:#17212B;--line:#24313E}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.8 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 18px 60px}header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.brand{font-size:28px;font-weight:800;color:var(--p);text-decoration:none;direction:ltr;unicode-bidi:isolate}.brand span{color:#F5A623}
nav{font-size:14px;color:var(--muted)}nav a{color:var(--p)}a[aria-current]{font-weight:700;text-decoration:none;color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;margin-top:18px}h1{font-size:26px;margin:0 0 8px}h2{font-size:18px;margin:18px 0 4px}
label{display:block;font-weight:600;margin-top:12px}input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px}
button{margin-top:16px;width:100%;padding:14px;border:0;border-radius:14px;background:#DC2626;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
.msg{padding:12px;border-radius:12px;background:rgba(47,122,140,.12)}.err{background:rgba(220,38,38,.12)}footer{margin-top:28px;font-size:14px;color:var(--muted)}footer a{color:var(--p)}
</style></head><body><main><header><a class="brand" href="/?lang=${lang}">Query<span>?</span></a><nav>${langs}</nav></header>
<div class="card"><h1>${esc(title)}</h1>${body}</div>
<footer><a href="/privacy?lang=${lang}">${esc(UI[lang].privacy)}</a> · <a href="/terms?lang=${lang}">${esc(UI[lang].terms)}</a> · <a href="/delete-account?lang=${lang}">${esc(UI[lang].del)}</a></footer>
</main></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
  res.end(html);
}

module.exports = (r, { uploadDir, limit }) => {
  r.get('/privacy', (ctx) => { const l = pickLang(ctx); page(ctx.res, l, UI[l].privacy, toHtml(legal[l].privacy)); });
  r.get('/terms', (ctx) => { const l = pickLang(ctx); page(ctx.res, l, UI[l].terms, toHtml(legal[l].terms)); });

  const form = (l, note, isErr) => `${note ? `<p class="msg${isErr ? ' err' : ''}">${esc(note)}</p>` : ''}<p>${esc(UI[l].delIntro)}</p>
    <form method="post" action="/delete-account?lang=${l}"><label for="e">${esc(UI[l].email)}</label><input id="e" name="email" type="email" required autocomplete="email">
    <label for="p">${esc(UI[l].password)}</label><input id="p" name="password" type="password" required autocomplete="current-password">
    <button type="submit">${esc(UI[l].delBtn)}</button></form><p style="font-size:14px;opacity:.8">${esc(UI[l].socialNote)}</p>`;
  r.get('/delete-account', (ctx) => { const l = pickLang(ctx); page(ctx.res, l, UI[l].del, form(l)); });
  r.post('/delete-account', limit, (ctx) => {
    const l = pickLang(ctx);
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const u = email && one('SELECT * FROM users WHERE email = ?', email);
    if (!u || !verifyPassword(String(ctx.body.password || ''), u.password_hash)) return page(ctx.res, l, UI[l].del, form(l, UI[l].wrong, true));
    const files = all('SELECT media_url FROM posts WHERE user_id = ? AND media_url IS NOT NULL', u.id).map((p) => p.media_url);
    if (u.avatar_url) files.push(u.avatar_url);
    run('DELETE FROM users WHERE id = ?', u.id);
    files.filter((f) => !/^https?:/.test(f)).forEach((f) => fs.rm(path.join(uploadDir, f), () => {}));
    return page(ctx.res, l, UI[l].del, `<p class="msg">${esc(UI[l].done)}</p>`);
  });
};
