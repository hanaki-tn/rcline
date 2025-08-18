import { google } from 'googleapis';
import sqlite3 from 'sqlite3';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || 'Members';
const DB_PATH = process.env.DATABASE_PATH || '/app/data/rcline.db';

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !SHEETS_ID) {
  console.error('Missing required environment variables:');
  console.error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_SHEETS_ID');
  process.exit(1);
}

// JSTの現在時刻をISO8601で取得
function nowJST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T') + '+09:00';
}

// 名前正規化（name_key生成）
function generateNameKey(name) {
  if (!name) return '';
  return name.replace(/\s+/g, '').toLowerCase();
}

async function syncMembers() {
  try {
    // Google Sheets API初期化
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    // スプレッドシートからデータ取得
    console.log('Fetching data from Google Sheets...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEETS_ID,
      range: `${SHEET_NAME}!A:H`, // A〜H列（8列）
    });
    
    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      console.log('No data found or only header row');
      return;
    }
    
    // ヘッダー行を除去
    const dataRows = rows.slice(1);
    console.log(`Found ${dataRows.length} member records`);
    
    // SQLite接続
    const db = new sqlite3.Database(DB_PATH);
    
    // トランザクション開始
    await new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    try {
      const now = nowJST();
      let insertCount = 0;
      let updateCount = 0;
      
      for (const row of dataRows) {
        const [
          member_id,
          name,
          name_key_from_sheet, // シートの値（使わない、自動生成）
          display_order,
          line_user_id,
          line_display_name,
          is_target,
          role
        ] = row;
        
        if (!member_id || !name) {
          console.log(`Skipping row with missing id or name:`, row);
          continue;
        }
        
        // name_keyを自動生成
        const name_key = generateNameKey(name);
        
        // 既存チェック
        const existingMember = await new Promise((resolve, reject) => {
          db.get('SELECT id FROM members WHERE id = ?', [parseInt(member_id)], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        if (existingMember) {
          // 更新
          await new Promise((resolve, reject) => {
            db.run(`
              UPDATE members SET 
                name = ?, name_key = ?, display_order = ?, 
                line_user_id = ?, line_display_name = ?, 
                is_target = ?, role = ?, updated_at = ?
              WHERE id = ?
            `, [
              name,
              name_key,
              display_order ? parseInt(display_order) : null,
              line_user_id || null,
              line_display_name || null,
              is_target ? parseInt(is_target) : 0,
              role || 'member',
              now,
              parseInt(member_id)
            ], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          updateCount++;
        } else {
          // 新規挿入
          await new Promise((resolve, reject) => {
            db.run(`
              INSERT INTO members (
                id, name, name_key, display_order, 
                line_user_id, line_display_name, is_target, role,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              parseInt(member_id),
              name,
              name_key,
              display_order ? parseInt(display_order) : null,
              line_user_id || null,
              line_display_name || null,
              is_target ? parseInt(is_target) : 0,
              role || 'member',
              now,
              now
            ], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          insertCount++;
        }
      }
      
      // コミット
      await new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log(`\n=== 同期完了 ===`);
      console.log(`新規追加: ${insertCount}件`);
      console.log(`更新: ${updateCount}件`);
      
    } catch (error) {
      // ロールバック
      await new Promise((resolve) => {
        db.run('ROLLBACK', () => resolve());
      });
      throw error;
    } finally {
      db.close();
    }
    
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

syncMembers();