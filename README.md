# README

このファイルは「このプロジェクトの説明書」です。  
初めて開いた人が迷わないように、使い方や構成をまとめます。

## package.json の説明（初心者向け）

`package.json` は **Node.jsプロジェクトの設定ファイル** です。  
ここには「アプリ名」「使うライブラリ」「起動方法」などが書かれています。

### 1. name / version / description
- **name**: プロジェクト名  
- **version**: バージョン番号  
- **description**: どんなアプリか一言説明

### 2. main
- **main** は「起点になるファイル名」  
  今回は `server.js` が入口です。

### 3. scripts
- **scripts** は「短いコマンドの登録」  
  例:  
  `npm start` → `node server.js` を実行する

### 4. dependencies
- **dependencies** は「アプリで使うライブラリ一覧」

今回の意味:
- `express`：Webサーバーを作る  
- `cors`：別ドメインからのアクセス許可  
- `bcryptjs`：パスワードの安全な保存  
- `jsonwebtoken`：ログイン用トークン（JWT）作成  
- `sqlite` / `sqlite3`：データベース

---

## よく使うコマンド

```bash
# 依存ライブラリをインストール
npm install

# サーバーを起動
npm start
```

---

## ログイン手順（初心者向け）

1. サーバーを起動します  
   ```bash
   npm install
   npm start
   ```
2. ブラウザで `http://localhost:8000` を開きます  
3. 画面の「新規登録」でメールとパスワードを作ります  
4. そのメールとパスワードで「ログイン」します  
5. ログインできたらデータはサーバー側に保存されます

---

## API仕様（簡易）

### 1. 新規登録
`POST /api/auth/register`

**リクエスト**
```json
{
  "email": "example@mail.com",
  "password": "password123"
}
```

**レスポンス**
```json
{ "id": 1 }
```

### 2. ログイン
`POST /api/auth/login`

**リクエスト**
```json
{
  "email": "example@mail.com",
  "password": "password123"
}
```

**レスポンス**
```json
{ "token": "JWT_TOKEN" }
```

### 3. 保存データ取得
`GET /api/state`

**ヘッダー**
```
Authorization: Bearer JWT_TOKEN
```

**レスポンス**
```json
{ "state": { ... } }
```

### 4. 保存データ更新
`PUT /api/state`

**ヘッダー**
```
Authorization: Bearer JWT_TOKEN
```

**リクエスト**
```json
{
  "state": { ... }
}
```

**レスポンス**
```json
{ "ok": true }
```
