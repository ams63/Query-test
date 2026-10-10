// Content Studio (admin): turns the best questions & answers into ready-to-post images for Instagram, Snapchat,
// TikTok, Facebook, X and WhatsApp (feed 4:5 and story 9:16), in Arabic/English/Turkish/Spanish, with a caption
// and a tracked link. Download the image, or publish straight to your Facebook Page / Instagram account.
const fs = require('node:fs');
const path = require('node:path');
const { all } = require('../db');
const { HttpError, saveUpload } = require('../lib/http');
const meta = require('../lib/meta');

module.exports = (r, { requireAuth, uploadDir }) => {
  const admin = (ctx) => { if (!ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN'); };

  r.get('/api/admin/studio/items', requireAuth, admin, (ctx) => {
    const days = Math.min(Number(ctx.query.days) || 14, 365);
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    return all(`SELECT p.id, p.content, p.product_name, p.rating, p.lf_kind, p.created_at, c.key AS cat_key, c.color,
        c.name_ar, c.name_en, c.name_tr, c.name_es,
        (SELECT content FROM comments WHERE id = p.best_comment_id AND hidden = 0) AS best,
        (SELECT content FROM comments m WHERE m.post_id = p.id AND m.hidden = 0 ORDER BY m.created_at LIMIT 1) AS first_answer,
        (SELECT COUNT(*) FROM comments m WHERE m.post_id = p.id AND m.hidden = 0) AS answers,
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes
      FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE p.hidden = 0 AND p.created_at >= ? AND length(p.content) >= 8
      ORDER BY (likes + answers * 2) DESC, p.created_at DESC LIMIT 40`, since)
      .map((x) => ({ ...x, answer: x.best || x.first_answer, link: `${ctx.base}/q/${x.id}` }));
  });

  r.post('/api/admin/studio/publish', requireAuth, admin, async (ctx) => {
    const f = ctx.files.find((x) => x.field === 'image');
    if (!f) throw new HttpError(400, 'VALIDATION_ERROR', { image: 'required' });
    const name = saveUpload(f, 'image', uploadDir);
    const targets = String(ctx.body.targets || '').split(',').filter((t) => ['facebook', 'instagram'].includes(t));
    if (!targets.length) throw new HttpError(400, 'VALIDATION_ERROR', { targets: 'required' });
    const result = await meta.publishImage({ imageUrl: `${ctx.base}/uploads/${name}`, caption: String(ctx.body.caption || '').slice(0, 2000), targets });
    return { imageUrl: `${ctx.base}/uploads/${name}`, result };
  });

  r.get('/studio', (ctx) => {
    ctx.res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    ctx.res.end(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'studio.html'), 'utf8'));
  });
};
