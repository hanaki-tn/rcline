import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { linkByDisplayName } from '../services/linker.js';
import { nowJST } from '../database.js';

// LINE Profile API
async function getLineProfile(userId) {
  try {
    const response = await axios.get(
      `https://api.line.me/v2/bot/profile/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        },
        timeout: 5000
      }
    );
    return response.data.displayName;
  } catch (error) {
    console.error('Failed to get LINE profile:', error.message);
    return null;
  }
}

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

// 友だち追加処理（非同期ジョブ）
export async function linkFollowProcessor(data) {
  const { mode, userId, replyToken, eventTs } = data;
  
  // 24時間以内のイベントのみ処理
  const now = Date.now();
  if (now - eventTs > 24 * 60 * 60 * 1000) {
    const logData = {
      ts: nowJST(),
      kind: 'follow',
      mode,
      userId,
      result: 'EXPIRED',
      reason: 'Event timestamp too old'
    };
    writeLog(logData);
    return logData;
  }

  try {
    // プロフィール取得
    const displayName = await getLineProfile(userId);
    
    // 紐づけ処理
    const linkResult = await linkByDisplayName(global.db, userId, displayName);
    
    // ログ記録
    const logData = {
      ts: nowJST(),
      kind: 'follow',
      mode,
      userId,
      displayName,
      normalized: linkResult.normalizedName,
      result: linkResult.type,
      member_id: linkResult.memberId,
      reason: linkResult.reason
    };
    writeLog(logData);
    
    // TODO: インタラクティブモード時の返信処理
    if (mode === 'interactive') {
      // 将来実装
    }
    
    return logData;
    
  } catch (error) {
    const logData = {
      ts: nowJST(),
      kind: 'follow',
      mode,
      userId,
      result: 'ERROR',
      reason: error.message
    };
    writeLog(logData);
    throw error;
  }
}