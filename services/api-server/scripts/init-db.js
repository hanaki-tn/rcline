import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';
const SCHEMA_PATH = './db/schema.sql';

// === 安全装置 ===
console.log('========================================');
console.log('       DB初期化スクリプト');
console.log('========================================');
console.log('実行日時:', new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
console.log('警告: このスクリプトは全データベースを削除して初期化します');
console.log('');
console.log('実行するには以下の手順に従ってください:');
console.log('1. このファイル内の "process.exit(1)" 行をコメントアウト');
console.log('2. スクリプトを再実行');
console.log('');
console.log('本番環境では絶対に実行しないでください！');
console.log('========================================');

// この行をコメントアウトして実行してください
process.exit(1);

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

    // 高速化インデックス追加
    console.log('Creating performance indexes...');
    const performanceIndexes = [
      // event_targets の複合検索最適化
      'CREATE INDEX IF NOT EXISTS idx_event_targets_lookup ON event_targets(event_id, member_id)',
      
      // event_responses の最新回答取得最適化
      'CREATE INDEX IF NOT EXISTS idx_event_responses_latest ON event_responses(event_id, member_id, responded_at DESC)',
      
      // members の表示順序最適化
      'CREATE INDEX IF NOT EXISTS idx_members_display ON members(display_order ASC NULLS LAST, name)',
      
      // 追加：LINE user ID による高速検索
      'CREATE INDEX IF NOT EXISTS idx_members_line_user_id ON members(line_user_id)',
      
      // 追加：管理者による作成イベント検索
      'CREATE INDEX IF NOT EXISTS idx_events_admin ON events(created_by_admin)'
    ];

    for (const indexSql of performanceIndexes) {
      await new Promise((resolve, reject) => {
        db.run(indexSql, (err) => {
          if (err) {
            console.warn('Index creation warning:', err.message);
            resolve(); // 警告として扱い、処理継続
          } else {
            resolve();
          }
        });
      });
    }

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