import express from 'express';
import crypto from 'crypto';
import { nowJST } from '../database.js';

const router = express.Router();

// LINE Webhook（友だち追加のサイレント自動紐づけ）
router.post('/webhook', async (req, res) => {
  try {
    // 署名検証
    const signature = req.headers['x-line-signature'];
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    
    if (!verifySignature(req.body, channelSecret, signature)) {
      console.log('Invalid LINE signature detected');
      // 設計書通り常に200を返す
      return res.json({ ok: true });
    }

    // Webhook処理
    const { events = [] } = req.body;
    
    for (const event of events) {
      if (event.type === 'follow') {
        // 非同期ジョブをキューに追加
        await req.queue.linkFollow.add('link_follow', {
          mode: process.env.ONBOARDING_MODE || 'silent',
          userId: event.source.userId,
          replyToken: event.replyToken,
          eventTs: event.timestamp
        });
      }
    }

    res.json({ ok: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    // 設計書通り常に200を返す
    res.json({ ok: true });
  }
});

// 署名検証
function verifySignature(body, channelSecret, signature) {
  if (!signature || !channelSecret) return false;
  
  const bodyStr = JSON.stringify(body);
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(bodyStr)
    .digest('base64');
    
  return signature === `SHA256=${hash}`;
}

export { router as lineRoutes };