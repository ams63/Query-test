// In-app notifications + Expo push (sent with fetch, no SDK).
const { id, run, one } = require('../db');

const TEXT = {
  comment: { ar: 'أجاب {name} على سؤالك', en: '{name} answered your question', tr: '{name} sorunuzu yanıtladı', es: '{name} respondió a tu pregunta' },
  best: { ar: 'اختيرت إجابتك كأفضل إجابة 🎉', en: 'Your answer was chosen as the best answer 🎉', tr: 'Cevabınız en iyi cevap seçildi 🎉', es: 'Tu respuesta fue elegida como la mejor 🎉' },
  newPost: { ar: 'سؤال جديد في {cat}', en: 'New question in {cat}', tr: '{cat} kategorisinde yeni soru', es: 'Nueva pregunta en {cat}' },
  like: { ar: 'أعجب {name} بسؤالك', en: '{name} liked your question', tr: '{name} sorunuzu beğendi', es: 'A {name} le gustó tu pregunta' },
  report: { ar: '⚠️ بلاغ خطير يحتاج مراجعة', en: '⚠️ Serious report needs review', tr: '⚠️ İncelenmesi gereken ciddi şikâyet', es: '⚠️ Denuncia grave para revisar' },
  invited: { ar: 'انضم {name} إلى Query عبر دعوتك 🎉 (+20 نقطة)', en: '{name} joined Query with your invite 🎉 (+20 points)', tr: '{name} davetinizle Query\'ye katıldı 🎉 (+20 puan)', es: '{name} se unió a Query con tu invitación 🎉 (+20 puntos)' },
  removed: { ar: 'حُذف محتوى لك لمخالفته قواعد المجتمع', en: 'Some of your content was removed for breaking the community rules', tr: 'İçeriğiniz topluluk kurallarını ihlal ettiği için kaldırıldı', es: 'Se eliminó contenido tuyo por incumplir las normas' },
};
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');

async function sendPush(token, title, body, data) {
  if (!token || process.env.DISABLE_PUSH === '1') return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default', channelId: 'default' }),
    });
    const j = await res.json().catch(() => null);
    if (j && j.data && j.data.details && j.data.details.error === 'DeviceNotRegistered') run('UPDATE users SET push_token = NULL WHERE push_token = ?', token);
  } catch (e) { console.warn('[push]', e.message); }
}

// Creates an inbox item and a push. vars: { name, cat }
function notify(userId, type, { actorId = null, postId = null, vars = {}, preview = '' } = {}) {
  const u = one('SELECT push_token, language FROM users WHERE id = ?', userId);
  if (!u) return;
  const title = fill((TEXT[type] || {})[u.language] || (TEXT[type] || {}).en || type, vars);
  run('INSERT INTO notifications (id, user_id, type, actor_id, post_id, text) VALUES (?,?,?,?,?,?)', id(), userId, type, actorId, postId, title);
  sendPush(u.push_token, title, preview.slice(0, 120), postId ? { url: `/post/${postId}` } : {});
}

module.exports = { notify };
