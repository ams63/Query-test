// Minimal HTTP toolkit built only on Node's standard library:
// routing with :params, JSON + multipart parsing, static files with Range support, CORS, errors.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class HttpError extends Error {
  constructor(status, code, details) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ---------- Router ----------
class Router {
  constructor() { this.routes = []; }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handlers });
  }
  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  patch(p, ...h) { this.add('PATCH', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }
  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    return pathMatched ? 'METHOD_NOT_ALLOWED' : null;
  }
}

// ---------- Body parsing ----------
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'PAYLOAD_TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// multipart/form-data → { fields, files: [{ field, filename, mimetype, data }] }
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new HttpError(400, 'BAD_MULTIPART');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const fields = {};
  const files = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break; // closing boundary
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headers = buf.slice(start + 2, headerEnd).toString('utf8');
    const next = buf.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;
    const data = buf.slice(headerEnd + 4, next - 2); // strip trailing \r\n
    const name = /name="([^"]*)"/i.exec(headers);
    const filename = /filename="([^"]*)"/i.exec(headers);
    const ctype = /content-type:\s*([^\r\n]+)/i.exec(headers);
    if (name) {
      if (filename && filename[1]) files.push({ field: name[1], filename: filename[1], mimetype: ctype ? ctype[1].trim().toLowerCase() : 'application/octet-stream', data });
      else fields[name[1]] = data.toString('utf8');
    }
    pos = next;
  }
  return { fields, files };
}

async function parseBody(req, { maxJson = 1e6, maxMultipart = 60e6 } = {}) {
  const type = (req.headers['content-type'] || '').toLowerCase();
  if (req.method === 'GET' || req.method === 'HEAD') return { body: {}, files: [] };
  if (type.startsWith('multipart/form-data')) {
    const buf = await readBody(req, maxMultipart);
    const { fields, files } = parseMultipart(buf, req.headers['content-type']);
    return { body: fields, files };
  }
  const buf = await readBody(req, maxJson);
  req.rawBody = buf; // kept for webhook signature checks
  if (!buf.length) return { body: {}, files: [] };
  if (type.includes('application/json') || buf[0] === 0x7b) {
    try { return { body: JSON.parse(buf.toString('utf8')), files: [] }; } catch { throw new HttpError(400, 'INVALID_JSON'); }
  }
  return { body: Object.fromEntries(new URLSearchParams(buf.toString('utf8'))), files: [] };
}

// ---------- Responses ----------
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.3gp': 'video/3gpp', '.webm': 'video/webm',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.caf': 'audio/x-caf', '.ogg': 'audio/ogg',
};

// Static file with HTTP Range support (needed for video/audio seeking on phones)
function serveFile(req, res, file) {
  return new Promise((resolve) => { res.once('close', resolve); res.once('finish', resolve); serveFileInner(req, res, file); });
}
function serveFileInner(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'NOT_FOUND' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const common = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      let start = range[1] ? parseInt(range[1], 10) : st.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : st.size - 1;
      if (Number.isNaN(start) || start < 0) start = 0;
      end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...common, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...common, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- File saving ----------
const KIND = {
  image: { exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'], mime: /^image\//, max: 10e6 },
  video: { exts: ['.mp4', '.mov', '.m4v', '.3gp', '.webm'], mime: /^video\//, max: 60e6 },
  audio: { exts: ['.m4a', '.aac', '.mp3', '.wav', '.caf', '.ogg', '.mp4', '.3gp', '.webm'], mime: /^(audio\/|video\/mp4|video\/3gpp|video\/webm)/, max: 15e6 },
};

function saveUpload(file, kind, dir) {
  const rule = KIND[kind];
  let ext = path.extname(file.filename || '').toLowerCase();
  if (!rule.exts.includes(ext)) {
    const fromMime = Object.entries(MIME).find(([, m]) => m === file.mimetype);
    ext = fromMime && rule.exts.includes(fromMime[0]) ? fromMime[0] : '';
  }
  if (!ext || !(rule.mime.test(file.mimetype) || file.mimetype === 'application/octet-stream')) throw new HttpError(400, 'UNSUPPORTED_FILE');
  if (file.data.length > rule.max) throw new HttpError(413, 'FILE_TOO_LARGE');
  if (!file.data.length) throw new HttpError(400, 'EMPTY_FILE');
  const name = crypto.randomBytes(12).toString('hex') + ext;
  fs.writeFileSync(path.join(dir, name), file.data);
  return name;
}

// ---------- Simple in-memory rate limiter ----------
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req) => {
    const key = req.ip + ':' + req.pathname;
    const now = Date.now();
    const h = hits.get(key) || { n: 0, reset: now + windowMs };
    if (now > h.reset) { h.n = 0; h.reset = now + windowMs; }
    h.n += 1;
    hits.set(key, h);
    if (h.n > max) throw new HttpError(429, 'TOO_MANY_REQUESTS');
  };
}

module.exports = { HttpError, Router, parseBody, parseMultipart, send, serveFile, saveUpload, rateLimit };
