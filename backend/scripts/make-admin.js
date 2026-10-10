// Give an existing user moderation rights: npm run make-admin -- someone@example.com
const { run, one } = require('../src/db');
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) { console.error('Usage: npm run make-admin -- email@example.com'); process.exit(1); }
if (!one('SELECT 1 FROM users WHERE email = ?', email)) { console.error('No user with that email. Register in the app first.'); process.exit(1); }
run('UPDATE users SET is_admin = 1 WHERE email = ?', email);
console.log(`${email} is now an admin.`);
