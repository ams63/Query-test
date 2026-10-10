// Product pages: every product that has reviews, with its average rating
const { db, one } = require('../db');
const { HttpError } = require('../lib/http');

module.exports = (r, { optionalAuth }) => {
  // ?q= search, ?sort=top|recent
  r.get('/api/products', optionalAuth, (ctx) => {
    const q = String(ctx.query.q || '').trim().slice(0, 80);
    const order = ctx.query.sort === 'recent' ? 'last_at DESC' : 'reviews DESC, avg DESC';
    return db.prepare(`SELECT product_key AS key, MAX(product_name) AS name, COUNT(*) AS reviews, ROUND(AVG(rating), 1) AS avg,
        MAX(created_at) AS last_at, MIN(price) AS min_price, MAX(price) AS max_price
      FROM posts WHERE product_key IS NOT NULL AND hidden = 0 ${q ? 'AND product_name LIKE $q' : ''}
      GROUP BY product_key ORDER BY ${order} LIMIT 50`).all(q ? { q: `%${q}%` } : {})
      .map((x) => ({ key: x.key, name: x.name, reviews: x.reviews, avg: x.avg, minPrice: x.min_price, maxPrice: x.max_price, lastAt: x.last_at }));
  });

  r.get('/api/products/:key', optionalAuth, (ctx) => {
    const s = one(`SELECT MAX(product_name) AS name, COUNT(*) AS reviews, ROUND(AVG(rating), 1) AS avg, MIN(price) AS min_price, MAX(price) AS max_price,
        SUM(rating = 5) AS s5, SUM(rating = 4) AS s4, SUM(rating = 3) AS s3, SUM(rating = 2) AS s2, SUM(rating = 1) AS s1
      FROM posts WHERE product_key = ? AND hidden = 0`, ctx.params.key);
    if (!s || !s.reviews) throw new HttpError(404, 'NOT_FOUND');
    return {
      key: ctx.params.key, name: s.name, reviews: s.reviews, avg: s.avg, minPrice: s.min_price, maxPrice: s.max_price,
      stars: { 5: s.s5, 4: s.s4, 3: s.s3, 2: s.s2, 1: s.s1 },
    };
  });
};
