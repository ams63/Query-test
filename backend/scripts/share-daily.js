// Post "Question of the day" to your Facebook Page / Instagram. Run once a day (cron / Render cron job):
//   node --disable-warning=ExperimentalWarning scripts/share-daily.js
const { shareQuestionOfDay } = require('../src/lib/meta');
const { shareToLinkedIn } = require('../src/lib/linkedin');
const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
if (!base) { console.error('Set PUBLIC_URL first'); process.exit(1); }
Promise.all([shareQuestionOfDay(base), shareToLinkedIn(base)])
  .then(([meta, li]) => console.log(JSON.stringify({ meta, linkedin: li })))
  .catch((e) => { console.error(e.message); process.exit(1); });
