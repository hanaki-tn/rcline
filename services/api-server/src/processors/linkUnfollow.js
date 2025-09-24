import fs from 'fs';
import path from 'path';
import { nowJST } from '../database.js';

// NDJSONログ書き込み
function writeLog(logData) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logDir = process.env.LOGS_BASE_PATH || '/app/logs';
  const logFile = path.join(logDir, 'line', `WEBHOOK-${date}.ndjson`);

  // ディレクトリ作成
  const dir = path.dirname(logFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ログ書き込み
  const logLine = JSON.stringify(logData) + '\n';
  fs.appendFileSync(logFile, logLine);
}

// ブロック・友だち削除処理（非同期ジョブ）
export async function linkUnfollowProcessor(data) {
  const { mode, userId, eventTs } = data;

  console.log(`[UNFOLLOW_PROCESSOR_START] userId: ${userId}, mode: ${mode}, eventTs: ${eventTs}`);

  // 24時間以内のイベントのみ処理
  const now = Date.now();
  if (now - eventTs > 24 * 60 * 60 * 1000) {
    const logData = {
      ts: nowJST(),
      kind: 'unfollow',
      mode,
      userId,
      result: 'EXPIRED',
      reason: 'Event timestamp too old'
    };
    writeLog(logData);
    return logData;
  }

  try {
    // ユーザーIDに紐づくメンバーを検索
    const member = global.db.prepare(
      'SELECT id, name FROM members WHERE line_user_id = ?'
    ).get(userId);

    if (member) {
      // LINE連携を解除し、配信対象からも除外
      global.db.prepare(`
        UPDATE members
        SET line_user_id = NULL,
            is_target = 0,
            updated_at = ?
        WHERE line_user_id = ?
      `).run(nowJST(), userId);

      const logData = {
        ts: nowJST(),
        kind: 'unfollow',
        mode,
        userId,
        result: 'UNLINKED',
        member_id: member.id,
        member_name: member.name,
        reason: 'User unfollow/block detected'
      };
      writeLog(logData);

      console.log(`[UNFOLLOW_PROCESSOR_SUCCESS] Member ${member.name} (ID: ${member.id}) unlinked`);
      return logData;

    } else {
      const logData = {
        ts: nowJST(),
        kind: 'unfollow',
        mode,
        userId,
        result: 'NOT_FOUND',
        reason: 'No linked member found'
      };
      writeLog(logData);

      return logData;
    }

  } catch (error) {
    const logData = {
      ts: nowJST(),
      kind: 'unfollow',
      mode,
      userId,
      result: 'ERROR',
      reason: error.message
    };
    writeLog(logData);
    throw error;
  }
}