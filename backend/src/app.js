// Builds the request handler (kept separate from server.js so tests can start it on any port)
const path = require('node:path');
const fs = require('node:fs');
const { Router, HttpError, parseBody, send, serveFile, rateLimit } = require('./lib/http');
const { verify } = require('./lib/auth');
const { one } = require('./db');

function createApp({ uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads') } = {}) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const router = new Router();

  const getUser = (req) => {
    const h = req.headers.authorization || '';
    const payload = h.startsWith('Bearer ') ? verify(h.slice(7)) : null;
    return payload ? one('SELECT * FROM users WHERE id = ?', payload.sub) : null;
  };
  const isBanned = (u) => u && u.banned_until && u.banned_until > Date.now();
  const requireAuth = (ctx) => {
    ctx.user = getUser(ctx.req);
    if (!ctx.user) throw new HttpError(401, 'UNAUTHORIZED');
    if (isBanned(ctx.user)) throw new HttpError(403, 'ACCOUNT_SUSPENDED', { until: ctx.user.banned_until });
  };
  const optionalAuth = (ctx) => { const u = getUser(ctx.req); ctx.user = isBanned(u) ? null : u; };
  const authLimiter = rateLimit({ windowMs: 15 * 60e3, max: Number(process.env.AUTH_RATE_LIMIT || 40) });
  const limit = (ctx) => authLimiter(ctx.req);

  const deps = { requireAuth, optionalAuth, limit, uploadDir };
  router.get('/health', () => ({ ok: true }));
  require('./routes/auth')(router, deps);
  require('./routes/me')(router, deps);
  require('./routes/posts')(router, deps);
  require('./routes/comments')(router, deps);
  require('./routes/misc')(router, deps);
  require('./routes/products')(router, deps);
  require('./routes/share')(router, deps);
  require('./routes/growth')(router, deps);
  require('./routes/seo')(router, deps);
  require('./routes/studio')(router, deps);
  require('./routes/web')(router, deps);

  const corsOrigin = process.env.CORS_ORIGIN || '*';

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://x');
    req.pathname = url.pathname;
    req.ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
      const name = path.basename(url.pathname); // blocks ../ traversal
      return serveFile(req, res, path.join(uploadDir, name));
    }
    try {
      const m = router.match(req.method, url.pathname);
      if (m === 'METHOD_NOT_ALLOWED') throw new HttpError(405, 'METHOD_NOT_ALLOWED');
      if (!m) throw new HttpError(404, 'NOT_FOUND');
      const { body, files } = await parseBody(req);
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const ctx = {
        req, res, params: m.params, query: Object.fromEntries(url.searchParams), body, files,
        base: (process.env.PUBLIC_URL || `${proto}://${req.headers.host}`).replace(/\/$/, ''),
      };
      let out;
      for (const h of m.route.handlers) out = await h(ctx);
      if (res.headersSent || res.writableEnded) return; // handler already responded (HTML pages, redirects)
      if (out && out.status && 'data' in out) send(res, out.status, out.data);
      else send(res, 200, out === undefined ? { ok: true } : out);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: e.code || 'SERVER_ERROR', details: e.details });
    }
  };
}

module.exports = { createApp };
