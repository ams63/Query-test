// Password hashing (scrypt) and JWT (HS256) using node:crypto only.
const crypto = require('node:crypto');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('JWT_SECRET must be set in production'); process.exit(1);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const b64u = (b) => Buffer.from(b).toString('base64url');
function sign(payload, ttlSec = 60 * 60 * 24 * 30) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec };
  const data = `${b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64u(JSON.stringify(body))}`;
  return `${data}.${crypto.createHmac('sha256', SECRET).update(data).digest('base64url')}`;
}
function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const sig = crypto.createHmac('sha256', SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (sig.length !== given.length || !crypto.timingSafeEqual(sig, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

module.exports = { hashPassword, verifyPassword, sign, verify };
