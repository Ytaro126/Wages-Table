// Node標準: パス操作やファイル操作に使う
const path = require('path');
const fs = require('fs');
// Webサーバーを作るためのライブラリ
const express = require('express');
// ブラウザからのアクセスを許可するための設定
const cors = require('cors');
// パスワードを安全に保存するためのハッシュ化ライブラリ
const bcrypt = require('bcryptjs');
// ログイン用のトークン(JSON Web Token)を作る
const jwt = require('jsonwebtoken');
// SQLite（軽量DB）を使うためのライブラリ
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

// サーバーのポート番号（未指定なら8000）
const PORT = process.env.PORT || 8000;
// JWT用の秘密鍵（本番では必ず環境変数で設定）
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// DB保存場所
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'app.db');

// dataフォルダが無ければ作成
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

// サーバー本体を作成
const app = express();
// 別ドメインからのアクセスを許可
app.use(cors());
// JSONの受け取りを有効化
app.use(express.json({ limit: '1mb' }));
// 静的ファイル（HTML/CSS/JS）を配信
app.use(express.static(__dirname));

// SQLite接続を入れておく変数
let db;

async function initDb() {
  // DBファイルを開く
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  // テーブルが無ければ作る
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

  // 固定ユーザーを事前登録（Ytaro / taro）
  const seedUsers = [
    { id: 'Ytaro', password: 'Ytaro' },
    { id: 'taro',  password: 'taro'  },
  ];
  for (const u of seedUsers) {
    const exists = await db.get('SELECT id FROM users WHERE email = ?', [u.id]);
    if (!exists) {
      const hash = await bcrypt.hash(u.password, 10);
      const now = new Date().toISOString();
      await db.run(
        'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
        [u.id, hash, now]
      );
    }
  }
}

function signToken(user) {
  // ユーザー情報をトークンにして返す
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  // Authorization: Bearer xxx のトークンを取り出す
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    // トークンが正しければ中身を復元
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    // 壊れている/期限切れなら拒否
    return res.status(401).json({ error: 'unauthorized' });
  }
}

// ログイン（ID / パスワード）
app.post('/api/auth/login', async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: 'invalid' });
  // 登録済みユーザーを探す（email列をIDとして使う）
  const user = await db.get('SELECT * FROM users WHERE email = ?', [id]);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  // パスワードが一致するか確認
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  // OKならトークンを返す
  return res.json({ token: signToken(user) });
});

// 保存データを取得
// 保存データを取得
app.get('/api/state', authMiddleware, async (req, res) => {
  const row = await db.get('SELECT state_json FROM states WHERE user_id = ?', [req.user.uid]);
  if (!row) return res.json({ state: null });
  try {
    return res.json({ state: JSON.parse(row.state_json) });
  } catch {
    return res.json({ state: null });
  }
});

// 保存データを更新
// 保存データを更新
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

// それ以外のURLは index.html を返す
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// DBを用意してからサーバー起動
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
