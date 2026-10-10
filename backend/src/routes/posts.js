const fs = require('node:fs');
const path = require('node:path');
const { db, one, all, run, id, tx } = require('../db');
const { check } = require('../lib/validate');
const { HttpError, saveUpload } = require('../lib/http');
const { notify } = require('../lib/notify');
const S = require('../lib/serialize');
const { assertClean, assertCleanMedia } = require('../lib/moderation');
const { handleReport } = require('../lib/reports');
const { productKey } = require('../lib/products');

const TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'LOCATION', 'POLL'];
const MEDIA_KIND = { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' };
const PAGE = 20;
const catName = (c, lang) => ({ ar: c.name_ar, en: c.name_en, tr: c.name_tr, es: c.name_es })[lang] || c.name_en;

const haversineKm = (a, b, c, d) => {
  const R = 6371, t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Loads one post the viewer is allowed to see
function loadPost(postId, viewer) {
  const row = db.prepare(`${S.POST_SELECT} WHERE p.id = $id AND (p.hidden = 0 OR p.user_id = $viewer)`).get({ id: postId, viewer: viewer ? viewer.id : null });
  if (!row) throw new HttpError(404, 'NOT_FOUND');
  return row;
}

module.exports = (r, { requireAuth, optionalAuth, uploadDir }) => {
  // Feed: ?category=&q=&sort=latest|popular|unanswered&page=&mine=1&bookmarked=1&user=&type=&near=lat,lng&radiusKm=
  r.get('/api/posts', optionalAuth, (ctx) => {
    const q = ctx.query;
    const viewer = ctx.user ? ctx.user.id : null;
    const where = ['(p.hidden = 0 OR p.user_id = $viewer)'];
    const p = { viewer };
    if (q.category) { where.push('p.category_id = $cat'); p.cat = Number(q.category); }
    if (q.type && TYPES.includes(q.type)) { where.push('p.type = $type'); p.type = q.type; }
    if (q.lf === 'LOST' || q.lf === 'FOUND') { where.push('p.lf_kind = $lf'); p.lf = q.lf; }
    if (q.open === '1') where.push('p.resolved = 0');
    if (q.product) { where.push('p.product_key = $product'); p.product = String(q.product); }
    if (q.kind === 'job') where.push('p.job_title IS NOT NULL');
    if (q.q) { where.push('(p.content LIKE $q OR p.place_name LIKE $q)'); p.q = `%${String(q.q).slice(0, 80)}%`; }
    if (q.mine === '1') { if (!viewer) throw new HttpError(401, 'UNAUTHORIZED'); where.push('p.user_id = $viewer'); }
    if (q.bookmarked === '1') { if (!viewer) throw new HttpError(401, 'UNAUTHORIZED'); where.push('EXISTS(SELECT 1 FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.user_id = $viewer)'); }
    if (q.user) { where.push('p.user_id = $author AND (p.is_anonymous = 0 OR p.user_id = $viewer)'); p.author = String(q.user); }
    if (viewer) where.push('p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $viewer)');
    if (q.sort === 'unanswered') where.push('(SELECT COUNT(*) FROM comments c3 WHERE c3.post_id = p.id AND c3.hidden = 0) = 0');
    let near = null;
    if (q.near) {
      const [lat, lng] = String(q.near).split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const km = Math.min(Number(q.radiusKm) || 25, 500);
        near = { lat, lng, km };
        where.push('p.lat BETWEEN $la1 AND $la2 AND p.lng BETWEEN $lo1 AND $lo2');
        const dLat = km / 111, dLng = km / (111 * Math.cos((lat * Math.PI) / 180) || 1);
        Object.assign(p, { la1: lat - dLat, la2: lat + dLat, lo1: lng - dLng, lo2: lng + dLng });
      }
    }
    const order = q.sort === 'popular' ? 'ORDER BY (like_count + comment_count * 2) DESC, p.created_at DESC' : 'ORDER BY p.created_at DESC';
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    p.limit = PAGE + 1; p.offset = (page - 1) * PAGE;
    let rows = db.prepare(`${S.POST_SELECT} WHERE ${where.join(' AND ')} ${order} LIMIT $limit OFFSET $offset`).all(p);
    if (near) {
      rows = rows.map((x) => ({ ...x, distance_km: Math.round(haversineKm(near.lat, near.lng, x.lat, x.lng) * 10) / 10 })).filter((x) => x.distance_km <= near.km);
    }
    const hasMore = rows.length > PAGE;
    return { items: S.posts(rows.slice(0, PAGE), viewer, ctx.base), page, hasMore };
  });

  r.get('/api/posts/:id', optionalAuth, (ctx) => S.posts([loadPost(ctx.params.id, ctx.user)], ctx.user && ctx.user.id, ctx.base)[0]);

  // Create a question. multipart: categoryId, type, content, media, lat, lng, placeName, anonymous, pollOptions (JSON array)
  r.post('/api/posts', requireAuth, async (ctx) => {
    const b = ctx.body;
    const d = check({
      categoryId: { type: 'number', required: true },
      type: { type: 'string', required: true, enum: TYPES },
      content: { type: 'string', max: 2000, default: '' },
      lat: { type: 'number', min: -90, max: 90 }, lng: { type: 'number', min: -180, max: 180 },
      placeName: { type: 'string', max: 120 }, anonymous: { type: 'bool', default: false },
      lfKind: { type: 'string', enum: ['LOST', 'FOUND'] },
      productName: { type: 'string', max: 100 }, store: { type: 'string', max: 80 },
      price: { type: 'number', min: 0, max: 10000000 }, rating: { type: 'number', min: 1, max: 5 },
      pros: { type: 'string', max: 500 }, cons: { type: 'string', max: 500 },
      postKind: { type: 'string', enum: ['QUESTION', 'JOB'], default: 'QUESTION' },
      jobTitle: { type: 'string', max: 100 }, jobCompany: { type: 'string', max: 100 }, jobCity: { type: 'string', max: 60 },
      jobType: { type: 'string', enum: ['FULL_TIME', 'PART_TIME', 'REMOTE', 'FREELANCE', 'INTERNSHIP'] }, applyUrl: { type: 'string', max: 500 },
    }, { ...b, type: b.type || b.postType });
    const category = one('SELECT key FROM categories WHERE id = ?', d.categoryId);
    if (!category) throw new HttpError(400, 'VALIDATION_ERROR', { categoryId: 'invalid' });
    // Lost & Found posts must say whether something was lost or found
    const isLostFound = category.key === 'lostfound';
    if (isLostFound && !d.lfKind) throw new HttpError(400, 'VALIDATION_ERROR', { lfKind: 'required' });
    if (!isLostFound) d.lfKind = null;
    // Job opportunities (Jobs category only): title required; apply link must be a normal https address
    let job = null;
    if (d.postKind === 'JOB') {
      if (category.key !== 'money') throw new HttpError(400, 'VALIDATION_ERROR', { postKind: 'jobs_category_only' });
      if (!d.jobTitle || d.jobTitle.length < 2) throw new HttpError(400, 'VALIDATION_ERROR', { jobTitle: 'required' });
      let url = d.applyUrl ? d.applyUrl.trim() : null;
      if (url && /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) throw new HttpError(400, 'VALIDATION_ERROR', { applyUrl: 'invalid' }); // javascript:, data:, …
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      if (url && !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/[^\s]*)?$/i.test(url.replace(/^http:/i, 'https:'))) throw new HttpError(400, 'VALIDATION_ERROR', { applyUrl: 'invalid' });
      job = { title: d.jobTitle, company: d.jobCompany || null, city: d.jobCity || null, type: d.jobType || null, url: url ? url.replace(/^http:/i, 'https:') : null };
      assertClean(d.jobTitle, d.jobCompany, d.jobCity);
    }
    // Product reviews need a product name and a 1–5 star rating; one review per person per product
    const isReview = category.key === 'reviews';
    let review = null;
    if (isReview) {
      const errors = {};
      if (!d.productName || d.productName.length < 2) errors.productName = 'required';
      if (!d.rating || !Number.isInteger(d.rating)) errors.rating = 'required';
      if (!d.content && !d.pros && !d.cons && !MEDIA_KIND[d.type]) errors.content = 'required';
      if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', errors);
      const key = productKey(d.productName);
      if (one('SELECT 1 FROM posts WHERE user_id = ? AND product_key = ?', ctx.user.id, key)) throw new HttpError(409, 'ALREADY_REVIEWED');
      review = { key, name: d.productName, store: d.store || null, price: d.price ?? null, rating: d.rating, pros: d.pros || null, cons: d.cons || null };
      assertClean(d.productName, d.store, d.pros, d.cons);
    }

    let options = [];
    if (d.type === 'TEXT' && d.content.length < 3 && !isReview && !job) throw new HttpError(400, 'VALIDATION_ERROR', { content: 'min:3' });
    if (d.type === 'LOCATION' && (d.lat === undefined || d.lng === undefined)) throw new HttpError(400, 'VALIDATION_ERROR', { location: 'required' });
    if (d.type === 'POLL') {
      try { options = JSON.parse(b.pollOptions || '[]'); } catch { options = []; }
      options = (Array.isArray(options) ? options : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
      if (d.content.length < 3) throw new HttpError(400, 'VALIDATION_ERROR', { content: 'min:3' });
      if (options.length < 2 || options.some((o) => o.length > 80)) throw new HttpError(400, 'VALIDATION_ERROR', { pollOptions: 'min:2' });
    }
    // Automatic filter: nothing pornographic, indecent or insulting to religions is ever saved
    assertClean(d.content, d.placeName, options);
    let mediaName = null;
    if (MEDIA_KIND[d.type]) {
      const f = ctx.files.find((x) => x.field === 'media') || ctx.files[0];
      if (!f) throw new HttpError(400, 'VALIDATION_ERROR', { media: 'required' });
      await assertCleanMedia(f, MEDIA_KIND[d.type]);
      mediaName = saveUpload(f, MEDIA_KIND[d.type], uploadDir);
    }
    const pid = id();
    tx(() => {
      run(`INSERT INTO posts (id, user_id, category_id, type, content, media_url, lat, lng, place_name, is_anonymous, lf_kind)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`, pid, ctx.user.id, d.categoryId, d.type, d.content, mediaName,
      d.lat ?? null, d.lng ?? null, d.placeName || null, d.anonymous ? 1 : 0, d.lfKind);
      if (job) {
        run('UPDATE posts SET job_title = ?, job_company = ?, job_city = ?, job_type = ?, apply_url = ? WHERE id = ?', job.title, job.company, job.city, job.type, job.url, pid);
      }
      if (review) {
        run('UPDATE posts SET product_name = ?, product_key = ?, store = ?, price = ?, rating = ?, pros = ?, cons = ? WHERE id = ?',
          review.name, review.key, review.store, review.price, review.rating, review.pros, review.cons, pid);
      }
      options.forEach((text, i) => run('INSERT INTO poll_options (id, post_id, text, sort) VALUES (?,?,?,?)', id(), pid, text, i));
    });
    // Tell subscribers of this category (except the author and people who blocked them)
    const cat = one('SELECT name_ar, name_en, name_tr, name_es FROM categories WHERE id = ?', d.categoryId);
    const subs = all(`SELECT s.user_id, u.language FROM subscriptions s JOIN users u ON u.id = s.user_id
      WHERE s.category_id = ? AND s.user_id <> ? AND s.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)`, d.categoryId, ctx.user.id, ctx.user.id);
    subs.forEach((s) => notify(s.user_id, 'newPost', { actorId: d.anonymous ? null : ctx.user.id, postId: pid, vars: { cat: catName(cat, s.language) }, preview: d.content }));
    return { status: 201, data: S.posts([loadPost(pid, ctx.user)], ctx.user.id, ctx.base)[0] };
  });

  r.delete('/api/posts/:id', requireAuth, (ctx) => {
    const p = one('SELECT user_id, media_url FROM posts WHERE id = ?', ctx.params.id);
    if (!p) throw new HttpError(404, 'NOT_FOUND');
    if (p.user_id !== ctx.user.id && !ctx.user.is_admin) throw new HttpError(403, 'FORBIDDEN');
    run('DELETE FROM posts WHERE id = ?', ctx.params.id);
    if (p.media_url && !/^https?:/.test(p.media_url)) fs.rm(path.join(uploadDir, p.media_url), () => {});
    return { ok: true };
  });

  const toggle = (table, on) => (ctx) => {
    const p = loadPost(ctx.params.id, ctx.user);
    if (on) {
      const r0 = run(`INSERT OR IGNORE INTO ${table} (post_id, user_id) VALUES (?,?)`, p.id, ctx.user.id);
      if (table === 'likes' && r0.changes && p.user_id !== ctx.user.id) notify(p.user_id, 'like', { actorId: ctx.user.id, postId: p.id, vars: { name: ctx.user.name } });
    } else run(`DELETE FROM ${table} WHERE post_id = ? AND user_id = ?`, p.id, ctx.user.id);
    return S.posts([loadPost(p.id, ctx.user)], ctx.user.id, ctx.base)[0];
  };
  r.post('/api/posts/:id/like', requireAuth, toggle('likes', true));
  r.delete('/api/posts/:id/like', requireAuth, toggle('likes', false));
  r.post('/api/posts/:id/bookmark', requireAuth, toggle('bookmarks', true));
  r.delete('/api/posts/:id/bookmark', requireAuth, toggle('bookmarks', false));

  // Poll vote (one per user; can change vote)
  r.post('/api/posts/:id/vote', requireAuth, (ctx) => {
    const p = loadPost(ctx.params.id, ctx.user);
    if (p.type !== 'POLL') throw new HttpError(400, 'NOT_A_POLL');
    const opt = one('SELECT id FROM poll_options WHERE id = ? AND post_id = ?', String(ctx.body.optionId || ''), p.id);
    if (!opt) throw new HttpError(400, 'VALIDATION_ERROR', { optionId: 'invalid' });
    run('INSERT INTO poll_votes (post_id, user_id, option_id) VALUES (?,?,?) ON CONFLICT(post_id, user_id) DO UPDATE SET option_id = excluded.option_id', p.id, ctx.user.id, opt.id);
    return S.posts([loadPost(p.id, ctx.user)], ctx.user.id, ctx.base)[0];
  });

  // Author picks (or clears) the best answer
  r.post('/api/posts/:id/best', requireAuth, (ctx) => {
    const p = loadPost(ctx.params.id, ctx.user);
    if (p.user_id !== ctx.user.id) throw new HttpError(403, 'FORBIDDEN');
    const cid = ctx.body.commentId ? String(ctx.body.commentId) : null;
    const c = cid && one('SELECT id, user_id FROM comments WHERE id = ? AND post_id = ? AND hidden = 0', cid, p.id);
    if (cid && !c) throw new HttpError(400, 'VALIDATION_ERROR', { commentId: 'invalid' });
    run('UPDATE posts SET best_comment_id = ? WHERE id = ?', cid, p.id);
    if (c && c.user_id !== ctx.user.id && p.best_comment_id !== cid) notify(c.user_id, 'best', { actorId: ctx.user.id, postId: p.id });
    return S.posts([loadPost(p.id, ctx.user)], ctx.user.id, ctx.base)[0];
  });

  // Report → hidden automatically after N distinct reports, until an admin reviews it
  r.post('/api/posts/:id/report', requireAuth, (ctx) => {
    const p = loadPost(ctx.params.id, ctx.user);
    if (p.user_id === ctx.user.id) throw new HttpError(400, 'CANNOT_REPORT_OWN');
    handleReport({ table: 'posts', type: 'post', targetId: p.id, reporterId: ctx.user.id, reason: String(ctx.body.reason || '').slice(0, 300) });
    return { ok: true };
  });

  // Lost & Found: the author marks the item as returned / owner found
  r.post('/api/posts/:id/resolve', requireAuth, (ctx) => {
    const p = loadPost(ctx.params.id, ctx.user);
    if (p.user_id !== ctx.user.id) throw new HttpError(403, 'FORBIDDEN');
    if (!p.lf_kind) throw new HttpError(400, 'NOT_LOST_FOUND');
    run('UPDATE posts SET resolved = ? WHERE id = ?', ctx.body.resolved === false ? 0 : 1, p.id);
    return S.posts([loadPost(p.id, ctx.user)], ctx.user.id, ctx.base)[0];
  });

  // Block the author of a post (works for anonymous posts without revealing who it is)
  r.post('/api/posts/:id/block-author', requireAuth, (ctx) => {
    const p = loadPost(ctx.params.id, ctx.user);
    if (p.user_id === ctx.user.id) throw new HttpError(400, 'CANNOT_BLOCK_SELF');
    run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?,?)', ctx.user.id, p.user_id);
    return { ok: true };
  });
};
