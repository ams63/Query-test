// Reports: hide content after enough reports; pornographic/indecent or anti-religion reports act faster and alert admins
const { one, all, run, id } = require('../db');
const { notify } = require('./notify');

const REPORT_HIDE_THRESHOLD = Number(process.env.REPORT_HIDE_THRESHOLD || 3);
const SEVERE_REASONS = ['sexual', 'religion'];
const SEVERE_HIDE_THRESHOLD = Number(process.env.SEVERE_REPORT_THRESHOLD || 2);

function handleReport({ table, type, targetId, reporterId, reason }) {
  run('INSERT OR IGNORE INTO reports (id, reporter_id, target_type, target_id, reason) VALUES (?,?,?,?,?)', id(), reporterId, type, targetId, reason);
  const counts = one(`SELECT COUNT(*) AS n, SUM(CASE WHEN reason IN ('sexual','religion') THEN 1 ELSE 0 END) AS severe
    FROM reports WHERE target_type = ? AND target_id = ? AND resolved = 0`, type, targetId);
  if (counts.n >= REPORT_HIDE_THRESHOLD || counts.severe >= SEVERE_HIDE_THRESHOLD) run(`UPDATE ${table} SET hidden = 1 WHERE id = ?`, targetId);
  if (SEVERE_REASONS.includes(reason) && counts.severe === 1) {
    all('SELECT id FROM users WHERE is_admin = 1').forEach((a) => notify(a.id, 'report', { postId: type === 'post' ? targetId : null, preview: reason }));
  }
}

module.exports = { handleReport };
