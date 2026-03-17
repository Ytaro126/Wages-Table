const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'app.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

let db;

async function initDb() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS states (
      user_id INTEGER PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'invalid' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const now = new Date().toISOString();
    const result = await db.run(
      'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
      [email, hash, now]
    );
    return res.json({ id: result.lastID });
  } catch (e) {
    return res.status(400).json({ error: 'duplicate' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'invalid' });
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  return res.json({ token: signToken(user) });
});

app.get('/api/state', authMiddleware, async (req, res) => {
  const row = await db.get('SELECT state_json FROM states WHERE user_id = ?', [req.user.uid]);
  if (!row) return res.json({ state: null });
  try {
    return res.json({ state: JSON.parse(row.state_json) });
  } catch {
    return res.json({ state: null });
  }
});

app.put('/api/state', authMiddleware, async (req, res) => {
  const state = req.body?.state;
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'invalid' });
  const now = new Date().toISOString();
  const json = JSON.stringify(state);
  await db.run(
    `INSERT INTO states (user_id, state_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    [req.user.uid, json, now]
  );
  return res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
