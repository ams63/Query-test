// Consistent online backup of the SQLite database: node scripts/backup.js [targetDir]
// Keeps the last 14 backups. Schedule it daily (cron) or use your host's volume snapshots.
const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../src/db');
const dir = process.argv[2] || path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `query-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
const old = fs.readdirSync(dir).filter((f) => /^query-.*\.db$/.test(f)).sort().slice(0, -14);
old.forEach((f) => fs.rmSync(path.join(dir, f)));
console.log('Backup written:', file);
