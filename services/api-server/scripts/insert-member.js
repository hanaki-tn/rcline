import sqlite3 from 'sqlite3';
import { nowJST } from '../src/database.js';

const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';

const db = new sqlite3.Database(DB_PATH);

const memberData = {
  id: 12053868,
  name: '花木 英雄',
  name_key: '花木英雄',
  display_order: 1,
  line_user_id: null,
  line_display_name: '花木 英雄',
  is_target: 1,
  role: 'admin',
  created_at: '2025-08-18T15:30:00+09:00',
  updated_at: '2025-08-18T15:30:00+09:00'
};

db.run(`
  INSERT OR REPLACE INTO members (
    id, name, name_key, display_order, 
    line_user_id, line_display_name, is_target, role,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
  memberData.id,
  memberData.name,
  memberData.name_key,
  memberData.display_order,
  memberData.line_user_id,
  memberData.line_display_name,
  memberData.is_target,
  memberData.role,
  memberData.created_at,
  memberData.updated_at
], function(err) {
  if (err) {
    console.error('Error inserting member:', err);
  } else {
    console.log('Member inserted successfully:', memberData.name);
  }
  db.close();
});