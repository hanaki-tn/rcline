import fs from 'fs';
import path from 'path';

const LOGS_DIR = process.env.LOGS_BASE_PATH || '/app/logs';

function extractUnlinkedUsers() {
  console.log('=== 未紐づけユーザー抽出 ===\n');
  
  const lineLogsDir = path.join(LOGS_DIR, 'line');
  
  if (!fs.existsSync(lineLogsDir)) {
    console.log('ログディレクトリが存在しません:', lineLogsDir);
    return;
  }

  const logFiles = fs.readdirSync(lineLogsDir)
    .filter(file => file.endsWith('.ndjson'))
    .sort();

  if (logFiles.length === 0) {
    console.log('ログファイルが見つかりません');
    return;
  }

  console.log(`${logFiles.length}個のログファイルを処理中...\n`);

  const unlinkedUsers = [];
  const processedUserIds = new Set();

  // 各ログファイルを処理（新しい順）
  for (const logFile of logFiles.reverse()) {
    const filePath = path.join(lineLogsDir, logFile);
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.trim()) continue;

    const lines = content.trim().split('\n');
    
    // 各行を処理（新しい順）
    for (const line of lines.reverse()) {
      try {
        const log = JSON.parse(line);
        
        // フォローイベントで未紐づけのもの
        if (log.kind === 'follow' && 
            ['UNMATCHED', 'AMBIGUOUS', 'ALREADY_LINKED_OTHER'].includes(log.result) &&
            !processedUserIds.has(log.userId)) {
          
          unlinkedUsers.push({
            userId: log.userId,
            displayName: log.displayName || '（表示名なし）',
            normalized: log.normalized || '（正規化名なし）',
            result: log.result,
            reason: log.reason || '',
            timestamp: log.ts,
            logFile: logFile
          });
          
          processedUserIds.add(log.userId);
        }
      } catch (err) {
        console.error(`ログ解析エラー in ${logFile}:`, line.substring(0, 100));
      }
    }
  }

  // 結果出力
  if (unlinkedUsers.length === 0) {
    console.log('✅ 未紐づけユーザーはいません');
    return;
  }

  console.log(`⚠️  未紐づけユーザー: ${unlinkedUsers.length}人\n`);
  
  // テーブル形式で表示
  console.table(unlinkedUsers.map((user, index) => ({
    No: index + 1,
    userId: user.userId.substring(0, 20) + '...',
    displayName: user.displayName,
    result: user.result,
    timestamp: user.timestamp,
    reason: user.reason.substring(0, 30)
  })));

  // CSV出力
  console.log('\n=== CSV形式 ===');
  console.log('userId,displayName,normalized,result,reason,timestamp');
  unlinkedUsers.forEach(user => {
    console.log(`"${user.userId}","${user.displayName}","${user.normalized}","${user.result}","${user.reason}","${user.timestamp}"`);
  });

  console.log('\n=== 手動紐づけ手順 ===');
  unlinkedUsers.forEach((user, index) => {
    if (user.displayName !== '（表示名なし）') {
      console.log(`${index + 1}. ${user.displayName} → membersテーブルで検索 → line_user_id="${user.userId}" を設定`);
    }
  });
}

extractUnlinkedUsers();