const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'merchant',
  reset_token_hash TEXT,
  reset_expires INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#607D8B',
  icon TEXT NOT NULL DEFAULT '🛒'
);

CREATE TABLE IF NOT EXISTS merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  description TEXT NOT NULL DEFAULT '',
  photo TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  show_email INTEGER NOT NULL DEFAULT 0,
  show_phone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_weekday ON sessions(weekday);
CREATE INDEX IF NOT EXISTS idx_sessions_merchant ON sessions(merchant_id);
`);

// Catégories par défaut
if (db.prepare('SELECT COUNT(*) n FROM categories').get().n === 0) {
  const ins = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
  [
    ['Fruits & légumes', '#43A047', '🥕'],
    ['Boucherie & charcuterie', '#C62828', '🥩'],
    ['Poissonnerie', '#1E88E5', '🐟'],
    ['Fromage & produits laitiers', '#F9A825', '🧀'],
    ['Boulangerie & pâtisserie', '#EF6C00', '🥖'],
    ['Pizzas & street food', '#8E24AA', '🍕'],
    ['Fleurs & plantes', '#EC407A', '🌸'],
    ['Vêtements & accessoires', '#00897B', '👗'],
    ['Autre', '#607D8B', '🛒'],
  ].forEach((c) => ins.run(...c));
}

module.exports = { db, DATA_DIR };
