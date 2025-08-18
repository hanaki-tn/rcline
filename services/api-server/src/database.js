import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';

export function createDatabase() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Database connection failed:', err);
      process.exit(1);
    }
    console.log('Connected to SQLite database');
  });

  // 外部キー有効化
  db.run('PRAGMA foreign_keys = ON');
  
  return db;
}

// JSTの現在時刻をISO8601で取得
export function nowJST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T') + '+09:00';
}