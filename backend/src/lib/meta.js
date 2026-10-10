// Official Meta Graph API: post "Question of the day" to your own Facebook Page and Instagram Business account,
// and reply to people who message your Page / Instagram / WhatsApp Business number.
// Everything stays off until the matching environment variables are set.
const crypto = require('node:crypto');
const { one, run, db } = require('../db');

const graph = () => (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v21.0').replace(/\/$/, '');
const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();

async function call(path, params, { method = 'POST', bearer } = {}) {
  const headers = bearer ? { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/x-www-form-urlencoded' };
  const res = await fetch(`${graph()}${path}`, { method, headers, body: bearer ? JSON.stringify(params) : form(params) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Graph ${path}: ${(j.error && j.error.message) || res.status}`);
  return j;
}

const channels = () => ({
  facebook: !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN),
  instagram: !!(process.env.IG_USER_ID && process.env.FB_PAGE_TOKEN),
  whatsapp: !!process.env.WHATSAPP_TOKEN,
  webhook: !!(process.env.META_APP_SECRET && process.env.META_VERIFY_TOKEN),
});

db.exec(`CREATE TABLE IF NOT EXISTS meta_shares (
  post_id TEXT NOT NULL, channel TEXT NOT NULL, external_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY (post_id, channel)
)`);

// Most engaging recent question that is public, not anonymous, not Lost & Found, and not shared before
function pickQuestionOfDay() {
  return one(`SELECT p.*, c.name_ar, c.name_en, c.key AS c_key,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) + 2 * (SELECT COUNT(*) FROM comments m WHERE m.post_id = p.id AND m.hidden = 0) AS score
    FROM posts p JOIN categories c ON c.id = p.category_id
    WHERE p.hidden = 0 AND p.is_anonymous = 0 AND c.key <> 'lostfound' AND length(p.content) >= 10
      AND p.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days')
      AND p.id NOT IN (SELECT post_id FROM meta_shares)
    ORDER BY score DESC, p.created_at DESC LIMIT 1`);
}

async function shareQuestionOfDay(base) {
  const ch = channels();
  if (!ch.facebook && !ch.instagram) return { skipped: 'NOT_CONFIGURED' };
  const p = pickQuestionOfDay();
  if (!p) return { skipped: 'NO_QUESTION' };
  const link = `${base}/q/${p.id}`;
  const caption = `❓ ${p.content.slice(0, 400)}\n\n💬 شارك بإجابتك على Query — Answer on Query:\n${link}\n\n#Query #سؤال_اليوم`;
  const image = p.type === 'IMAGE' && p.media_url ? (/^https?:/.test(p.media_url) ? p.media_url : `${base}/uploads/${p.media_url}`) : `${base}/og-image.png`;
  const out = { postId: p.id };
  if (ch.facebook) {
    const r = await call(`/${process.env.FB_PAGE_ID}/feed`, { message: caption, link, access_token: process.env.FB_PAGE_TOKEN });
    run('INSERT OR REPLACE INTO meta_shares (post_id, channel, external_id) VALUES (?,?,?)', p.id, 'facebook', r.id);
    out.facebook = r.id;
  }
  if (ch.instagram) {
    const media = await call(`/${process.env.IG_USER_ID}/media`, { image_url: image, caption, access_token: process.env.FB_PAGE_TOKEN });
    const pub = await call(`/${process.env.IG_USER_ID}/media_publish`, { creation_id: media.id, access_token: process.env.FB_PAGE_TOKEN });
    run('INSERT OR REPLACE INTO meta_shares (post_id, channel, external_id) VALUES (?,?,?)', p.id, 'instagram', pub.id);
    out.instagram = pub.id;
  }
  return out;
}

// ---- Messaging webhook (Messenger, Instagram DMs, WhatsApp) ----
function validSignature(rawBody, header) {
  if (!process.env.META_APP_SECRET || !header || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const REPLY = {
  ar: 'أهلاً بك في Query 👋 اطرح سؤالك في التطبيق ليجيبك أشخاص يعرفون: {link}',
  en: 'Welcome to Query 👋 Ask your question in the app and get answers from people who know: {link}',
  tr: "Query'ye hoş geldiniz 👋 Sorunuzu uygulamada sorun, bilen insanlardan cevap alın: {link}",
  es: 'Bienvenido a Query 👋 Haz tu pregunta en la app y recibe respuestas de gente que sabe: {link}',
};
function guessLang(text) {
  const t = String(text || '');
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (/[çğışöü]/i.test(t) || /\b(merhaba|nasıl|soru)\b/i.test(t)) return 'tr';
  if (/[ñ¿¡]/.test(t) || /\b(hola|pregunta|gracias)\b/i.test(t)) return 'es';
  return 'en';
}

// Replies once per incoming text message. Messages are never posted publicly (privacy).
async function handleWebhook(body, base) {
  const link = process.env.APP_DOWNLOAD_URL || base;
  const sent = [];
  const text = (lang) => REPLY[lang].replace('{link}', link);
  for (const entry of body.entry || []) {
    for (const m of entry.messaging || []) { // Messenger + Instagram
      if (!m.message || m.message.is_echo || !m.sender) continue;
      await call('/me/messages', { recipient: JSON.stringify({ id: m.sender.id }), messaging_type: 'RESPONSE', message: JSON.stringify({ text: text(guessLang(m.message.text)) }), access_token: process.env.FB_PAGE_TOKEN });
      sent.push({ channel: body.object, to: m.sender.id });
    }
    for (const ch of entry.changes || []) { // WhatsApp Cloud API
      const v = ch.value || {};
      for (const msg of v.messages || []) {
        await call(`/${v.metadata.phone_number_id}/messages`, {
          messaging_product: 'whatsapp', to: msg.from, type: 'text', text: { body: text(guessLang(msg.text && msg.text.body)) },
        }, { bearer: process.env.WHATSAPP_TOKEN });
        sent.push({ channel: 'whatsapp', to: msg.from });
      }
    }
  }
  return sent;
}

// Publish a ready-made image (from the Content Studio) to the Page and/or Instagram
async function publishImage({ imageUrl, caption, targets }) {
  const ch = channels();
  const out = {};
  if (targets.includes('facebook')) {
    if (!ch.facebook) out.facebook = { error: 'NOT_CONFIGURED' };
    else out.facebook = await call(`/${process.env.FB_PAGE_ID}/photos`, { url: imageUrl, caption, access_token: process.env.FB_PAGE_TOKEN });
  }
  if (targets.includes('instagram')) {
    if (!ch.instagram) out.instagram = { error: 'NOT_CONFIGURED' };
    else {
      const media = await call(`/${process.env.IG_USER_ID}/media`, { image_url: imageUrl, caption, access_token: process.env.FB_PAGE_TOKEN });
      out.instagram = await call(`/${process.env.IG_USER_ID}/media_publish`, { creation_id: media.id, access_token: process.env.FB_PAGE_TOKEN });
    }
  }
  return out;
}

module.exports = { publishImage, channels, pickQuestionOfDay, shareQuestionOfDay, validSignature, handleWebhook, guessLang };
