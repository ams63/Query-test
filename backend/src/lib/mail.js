// Email via Resend's HTTP API (optional). Without RESEND_API_KEY, messages are printed to the console.
async function sendMail(to, subject, text) {
  if (!process.env.RESEND_API_KEY) { console.log(`\n[mail:dev] to=${to}\n${subject}\n${text}\n`); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'Query <no-reply@query.app>', to, subject, text }),
  });
  if (!res.ok) console.warn('[mail] failed', res.status, await res.text().catch(() => ''));
}
module.exports = { sendMail };
