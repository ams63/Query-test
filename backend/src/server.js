// Query API — zero-dependency Node.js server (requires Node 22.5+ for the built-in SQLite driver)
const fs = require('node:fs');
const path = require('node:path');
// Load .env without a library
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const http = require('node:http');
const { createApp } = require('./app');
const { ensureCategories, seedDemo } = require('./seed');
ensureCategories();
seedDemo();

const PORT = Number(process.env.PORT || 4000);
http.createServer(createApp()).listen(PORT, '0.0.0.0', () => console.log(`Query API listening on :${PORT}`));
