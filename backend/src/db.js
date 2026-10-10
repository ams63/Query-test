// SQLite database using Node's built-in driver (Node 22.5+). Single file, zero dependencies.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'query.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  avatar_url TEXT, bio TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT 'ar', theme TEXT NOT NULL DEFAULT 'teal',
  push_token TEXT, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  icon TEXT NOT NULL, color TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id), type TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  media_url TEXT, lat REAL, lng REAL, place_name TEXT, is_anonymous INTEGER NOT NULL DEFAULT 0,
  best_comment_id TEXT, hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_cat ON posts(category_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, text TEXT NOT NULL, sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_votes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE, PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, category_id)
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE (reporter_id, target_type, target_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE CASCADE, post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0
);
`);

// Add columns to existing databases without losing data
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('categories', 'name_tr', "TEXT NOT NULL DEFAULT ''");
addColumn('categories', 'name_es', "TEXT NOT NULL DEFAULT ''");
addColumn('posts', 'lf_kind', 'TEXT'); // Lost & Found: LOST | FOUND
addColumn('posts', 'resolved', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'banned_until', 'INTEGER'); // epoch ms; far future = permanent
addColumn('users', 'strikes', 'INTEGER NOT NULL DEFAULT 0');
// Product reviews ("Rate a product you bought")
addColumn('posts', 'product_name', 'TEXT');
addColumn('posts', 'product_key', 'TEXT'); // normalised name, groups reviews of the same product
addColumn('posts', 'store', 'TEXT');
addColumn('posts', 'price', 'REAL');
addColumn('posts', 'rating', 'INTEGER');
addColumn('posts', 'pros', 'TEXT');
addColumn('posts', 'cons', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_posts_product ON posts(product_key)');
// Growth: invites, campaigns (influencers/ads), smart-link clicks
addColumn('users', 'invite_code', 'TEXT');
addColumn('users', 'invited_by', 'TEXT');
addColumn('users', 'campaign', 'TEXT');
// LinkedIn profile link shown next to the name
addColumn('users', 'linkedin_url', 'TEXT');
// Job opportunities (Jobs category): title, company, city, type, apply link
addColumn('posts', 'job_title', 'TEXT');
addColumn('posts', 'job_company', 'TEXT');
addColumn('posts', 'job_city', 'TEXT');
addColumn('posts', 'job_type', 'TEXT'); // FULL_TIME | PART_TIME | REMOTE | FREELANCE | INTERNSHIP
addColumn('posts', 'apply_url', 'TEXT');
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite ON users(invite_code);
CREATE TABLE IF NOT EXISTS campaigns (code TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS link_clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, campaign TEXT, os TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
// Sign in with Apple / Google / Facebook
db.exec(`CREATE TABLE IF NOT EXISTS user_identities (
  provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), PRIMARY KEY (provider, subject)
)`);

const id = () => crypto.randomBytes(10).toString('hex');
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, id, one, all, run, tx };
