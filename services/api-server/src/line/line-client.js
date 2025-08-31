import { Client } from '@line/bot-sdk';
import { buildEventFlexMessage } from './flex-payload.js';

// SDKクライアント初期化
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// マルチキャスト送信（分割対応）
export async function sendEventMulticast({ lineUserIds, title, description, imageUrl, liffUrl, heldAt }) {
  if (!lineUserIds || lineUserIds.length === 0) {
    return { success: 0, fail: 0, errors: [] };
  }

  const message = buildEventFlexMessage({
    title,
    description,
    imageUrl,  // 必ずhttps://で始まること
    liffUrl,
    heldAt
  });

  const CHUNK_SIZE = 150; // LINE APIの推奨値
  let successCount = 0;
  let failCount = 0;
  const errors = [];

  // 150件ずつ分割送信
  for (let i = 0; i < lineUserIds.length; i += CHUNK_SIZE) {
    const chunk = lineUserIds.slice(i, i + CHUNK_SIZE);
    
    try {
      await client.multicast(chunk, message);
      successCount += chunk.length;
      console.log(`[LINE SDK] 送信成功: ${chunk.length}件`);
    } catch (error) {
      failCount += chunk.length;
      const errorDetail = {
        chunk: `${i}-${i + chunk.length}`,
        message: error.message,
        detail: error.response?.data
      };
      errors.push(errorDetail);
      console.error('[LINE SDK] 送信エラー:', errorDetail);
    }
  }

  return { success: successCount, fail: failCount, errors };
};