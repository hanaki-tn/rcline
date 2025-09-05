import sqlite3 from 'sqlite3';

const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';

const db = new sqlite3.Database(DB_PATH);

console.log('\n=== Members テーブル ===');
db.all('SELECT * FROM members ORDER BY display_order, name ASC', (err, rows) => {
  if (err) {
    console.error('Error:', err);
    process.exit(1);
  }
  
  if (rows.length === 0) {
    console.log('テーブルは空です');
  } else {
    console.table(rows);
  }
  
  db.close();
});