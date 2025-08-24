// 管理者アカウント作成スクリプト
import bcrypt from 'bcryptjs';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// パスワードをハッシュ化
const password = 'vLJCUJ';
const saltRounds = 12;
const passwordHash = bcrypt.hashSync(password, saltRounds);

console.log('パスワードハッシュ:', passwordHash);

// データベース接続
const dbPath = process.env.DATABASE_PATH || '/app/data/rcline.db';
const db = new sqlite3.Database(dbPath);

// admin_usersに挿入
const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + '+09:00';

db.run(`
  INSERT OR REPLACE INTO admin_users (username, password_hash, member_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`, ['hanaki', passwordHash, 12053868, now, now], function(err) {
  if (err) {
    console.error('エラー:', err.message);
  } else {
    console.log('管理者アカウント作成完了:', {
      username: 'hanaki',
      member_id: 12053868,
      password: 'vLJCUJ'
    });
  }
  db.close();
});