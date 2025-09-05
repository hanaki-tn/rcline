import sqlite3 from 'sqlite3';

// この行をコメントアウトして実行してください
process.exit(1);

const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';

const db = new sqlite3.Database(DB_PATH);

// line_display_nameをNULLに更新
db.run(`
  UPDATE members 
  SET line_display_name = NULL, 
      updated_at = '2025-08-18T16:00:00+09:00'
  WHERE id = 12053868
`, function(err) {
  if (err) {
    console.error('Error updating member:', err);
  } else {
    console.log('Member data fixed: line_display_name set to NULL');
  }
  db.close();
});