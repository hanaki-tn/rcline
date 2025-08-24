#!/usr/bin/env node

/**
 * 会員登録フローのテストスクリプト
 * 1. 未紐付けユーザーのis_targetチェック
 * 2. 会員登録画面への遷移確認
 * 3. 登録処理の動作確認
 */

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DATABASE_PATH || join(__dirname, '..', '..', '..', 'rcline.db');

console.log('=== 会員登録フローテスト ===');
console.log(`データベース: ${dbPath}`);
console.log('');

const db = new sqlite3.Database(dbPath);

// テスト用のLINE userIdを生成
const testUserId = `U_test_${Date.now()}`;

console.log('1. 未紐付けユーザーの状態確認');
console.log(`   テストuserID: ${testUserId}`);

// 未紐付けユーザーのチェック（存在しないuserIdなのでis_target=0として扱われる）
db.get(
  'SELECT id, name, is_target FROM members WHERE line_user_id = ?',
  [testUserId],
  (err, row) => {
    if (err) {
      console.error('エラー:', err);
      db.close();
      process.exit(1);
    }
    
    if (row) {
      console.log('   既存ユーザー:', row);
    } else {
      console.log('   → 未紐付けユーザー（is_target=0として扱われます）');
    }
    
    console.log('');
    console.log('2. 会員登録可能な名前の確認');
    
    // 登録可能な名前を確認
    db.all(
      `SELECT name, name_key, line_user_id, is_target 
       FROM members 
       WHERE line_user_id IS NULL OR line_user_id = ''
       ORDER BY display_order LIMIT 5`,
      [],
      (err, rows) => {
        if (err) {
          console.error('エラー:', err);
          db.close();
          process.exit(1);
        }
        
        if (rows.length > 0) {
          console.log('   登録可能な会員名（未紐付け）:');
          rows.forEach(r => {
            console.log(`   - ${r.name} (name_key: ${r.name_key})`);
          });
        } else {
          console.log('   登録可能な会員名がありません（全員紐付け済み）');
        }
        
        console.log('');
        console.log('3. 動作確認手順');
        console.log('');
        console.log('   【開発環境でのテスト】');
        console.log('   1. ブラウザで http://localhost:4000/liff/index.html を開く');
        console.log('   2. 開発者ツールのコンソールで以下を実行:');
        console.log(`      localStorage.setItem('dev-line-user-id', '${testUserId}');`);
        console.log('   3. ページをリロード');
        console.log('   4. 自動的に register.html へ遷移することを確認');
        console.log('   5. 上記の「登録可能な会員名」のいずれかを入力して登録');
        console.log('   6. 登録成功後、index.html へ戻ることを確認');
        console.log('');
        console.log('   【紐付け済みユーザーのテスト】');
        
        // 紐付け済みユーザーを取得
        db.get(
          'SELECT line_user_id, name FROM members WHERE line_user_id IS NOT NULL AND is_target = 1 LIMIT 1',
          [],
          (err, linkedUser) => {
            if (err) {
              console.error('エラー:', err);
              db.close();
              process.exit(1);
            }
            
            if (linkedUser) {
              console.log(`   1. localStorage.setItem('dev-line-user-id', '${linkedUser.line_user_id}');`);
              console.log('   2. ページをリロード');
              console.log('   3. register.html へ遷移せず、イベント一覧が表示されることを確認');
              console.log(`      （紐付け済み: ${linkedUser.name}）`);
            } else {
              console.log('   紐付け済みユーザーが存在しません');
            }
            
            console.log('');
            console.log('=== テスト情報出力完了 ===');
            db.close();
          }
        );
      }
    );
  }
);