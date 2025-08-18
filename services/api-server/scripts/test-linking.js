import { linkByDisplayName } from '../src/services/linker.js';
import { createDatabase } from '../src/database.js';

// テスト用のユーザーID（疑似LINE UserID）
const TEST_USER_ID = 'U_test_hanaki_123';

// テストケース
const testCases = [
  { displayName: '花木 英雄', expected: 'LINKED' },
  { displayName: '花木英雄', expected: 'LINKED' },
  { displayName: '花木  英雄', expected: 'LINKED' },  // スペース複数
  { displayName: '田中太郎', expected: 'UNMATCHED' }, // 存在しない名前
];

async function testLinking() {
  const db = createDatabase();
  
  console.log('=== 紐づけロジックテスト開始 ===\n');
  
  for (let i = 0; i < testCases.length; i++) {
    const { displayName, expected } = testCases[i];
    const testUserId = `${TEST_USER_ID}_${i}`;
    
    console.log(`テスト ${i + 1}: "${displayName}"`);
    
    try {
      const result = await linkByDisplayName(db, testUserId, displayName);
      
      console.log(`  結果: ${result.type}`);
      console.log(`  期待: ${expected}`);
      console.log(`  正規化名: ${result.normalizedName || 'なし'}`);
      console.log(`  会員ID: ${result.memberId || 'なし'}`);
      console.log(`  理由: ${result.reason || 'なし'}`);
      console.log(`  ✅ ${result.type === expected ? 'PASS' : 'FAIL'}\n`);
      
    } catch (error) {
      console.error(`  エラー:`, error);
      console.log(`  ❌ ERROR\n`);
    }
  }
  
  // 最終状態確認
  console.log('=== 最終データ確認 ===');
  db.all('SELECT * FROM members', (err, rows) => {
    if (err) {
      console.error('データ取得エラー:', err);
    } else {
      console.table(rows);
    }
    db.close();
  });
}

testLinking();