import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';
const SCHEMA_PATH = './db/schema.sql';

// JSTの現在時刻をISO8601で取得
function nowJST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T') + '+09:00';
}

async function initDatabase() {
  try {
    // ディレクトリ作成
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // SQLite接続
    const db = new sqlite3.Database(DB_PATH);
    
    // スキーマ読み込み
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    
    // スキーマ実行
    await new Promise((resolve, reject) => {
      db.exec(schema, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // 初期管理ユーザー作成
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const now = nowJST();

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT OR IGNORE INTO admin_users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [adminUsername, passwordHash, now, now],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    db.close();
    console.log('Database initialized successfully');
    console.log(`Admin user: ${adminUsername} / ${adminPassword}`);
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();