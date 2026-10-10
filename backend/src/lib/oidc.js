// Verifies "Sign in with Apple" / "Sign in with Google" ID tokens (RS256 JWTs) against the providers' public keys,
// and Facebook access tokens through the Graph API. Only node:crypto + fetch, no SDKs.
const crypto = require('node:crypto');

const cache = new Map(); // jwksUrl → { keys, at }
async function jwks(url, force) {
  const c = cache.get(url);
  if (!force && c && Date.now() - c.at < 6 * 3600e3) return c.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  const { keys } = await res.json();
  cache.set(url, { keys, at: Date.now() });
  return keys;
}

const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

async function verifyJwt(token, { jwksUrl, issuers, audiences }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = b64json(parts[0]);
  const payload = b64json(parts[1]);
  if (header.alg !== 'RS256') throw new Error('unexpected alg');
  let key = (await jwks(jwksUrl)).find((k) => k.kid === header.kid);
  if (!key) key = (await jwks(jwksUrl, true)).find((k) => k.kid === header.kid); // keys rotate
  if (!key) throw new Error('unknown key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  const now = Date.now() / 1000;
  if (!issuers.includes(payload.iss)) throw new Error('bad issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => audiences.includes(a))) throw new Error('bad audience');
  if (!(payload.exp > now - 60)) throw new Error('expired');
  return payload;
}

const truthy = (v) => v === true || v === 'true';

// LinkedIn: the app gets an authorization code through our /auth/linkedin/callback page; the server exchanges it
// (the client secret never leaves the server) and verifies the returned OpenID Connect ID token.
async function linkedinExchange(code, redirectUri) {
  const res = await fetch(process.env.LINKEDIN_TOKEN_URL || 'https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: process.env.LINKEDIN_CLIENT_ID, client_secret: process.env.LINKEDIN_CLIENT_SECRET }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id_token) throw new Error('linkedin exchange failed');
  return j.id_token;
}

const PROVIDERS = {
  linkedin: {
    configured: () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    async verify(code, { redirectUri } = {}) {
      const idToken = await linkedinExchange(code, redirectUri);
      const p = await verifyJwt(idToken, {
        jwksUrl: process.env.LINKEDIN_JWKS_URL || 'https://www.linkedin.com/oauth/openid/jwks',
        issuers: ['https://www.linkedin.com/oauth', 'https://www.linkedin.com'], audiences: [process.env.LINKEDIN_CLIENT_ID],
      });
      return { subject: p.sub, email: p.email || null, emailVerified: p.email_verified === true || p.email_verified === 'true', name: p.name || [p.given_name, p.family_name].filter(Boolean).join(' ') || null, picture: p.picture || null };
    },
  },
  apple: {
    configured: () => list(process.env.APPLE_CLIENT_IDS).length > 0,
    async verify(token) {
      const p = await verifyJwt(token, {
        jwksUrl: process.env.APPLE_JWKS_URL || 'https://appleid.apple.com/auth/keys',
        issuers: ['https://appleid.apple.com'], audiences: list(process.env.APPLE_CLIENT_IDS),
      });
      return { subject: p.sub, email: p.email || null, emailVerified: truthy(p.email_verified), name: null, picture: null };
    },
  },
  google: {
    configured: () => list(process.env.GOOGLE_CLIENT_IDS).length > 0,
    async verify(token) {
      const p = await verifyJwt(token, {
        jwksUrl: process.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs',
        issuers: ['https://accounts.google.com', 'accounts.google.com'], audiences: list(process.env.GOOGLE_CLIENT_IDS),
      });
      return { subject: p.sub, email: p.email || null, emailVerified: truthy(p.email_verified), name: p.name || null, picture: p.picture || null };
    },
  },
  facebook: {
    configured: () => !!(process.env.FB_APP_ID && process.env.FB_APP_SECRET),
    async verify(token) {
      const graph = process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0';
      const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
      const dbg = await (await fetch(`${graph}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`)).json();
      if (!dbg.data || !dbg.data.is_valid || String(dbg.data.app_id) !== String(process.env.FB_APP_ID)) throw new Error('invalid facebook token');
      const me = await (await fetch(`${graph}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`)).json();
      if (!me.id || me.id !== String(dbg.data.user_id)) throw new Error('facebook user mismatch');
      return { subject: me.id, email: me.email || null, emailVerified: !!me.email, name: me.name || null, picture: me.picture && me.picture.data ? me.picture.data.url : null };
    },
  },
};

module.exports = { PROVIDERS, verifyJwt };
