// "5m", "منذ 3 س" … falls back to a date after a week
export function timeAgo(iso, t, lang) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('justNow');
  if (s < 3600) return t('minutesAgo').replace('{n}', Math.floor(s / 60));
  if (s < 86400) return t('hoursAgo').replace('{n}', Math.floor(s / 3600));
  if (s < 7 * 86400) return t('daysAgo').replace('{n}', Math.floor(s / 86400));
  const locale = { ar: 'ar-SA-u-ca-gregory', en: 'en-GB', tr: 'tr-TR', es: 'es-ES' }[lang] || 'en-GB';
  try { return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }); } catch { return iso.slice(0, 10); }
}
