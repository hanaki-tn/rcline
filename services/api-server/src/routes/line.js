import express from 'express';
import crypto from 'crypto';
import { nowJST } from '../database.js';

const router = express.Router();

// LINE Webhook（友だち追加のサイレント自動紐づけ）
router.post('/webhook', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] INFO: LINE Webhook受信開始`);
    
    // 署名検証
    const signature = req.headers['x-line-signature'];
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    
    console.log(`[${new Date().toISOString()}] INFO: 署名検証開始 - signature存在: ${!!signature}, secret存在: ${!!channelSecret}`);
    
    if (!verifySignature(req.body, channelSecret, signature)) {
      console.error(`[${new Date().toISOString()}] ERROR: LINE署名検証失敗 - signature: ${signature?.substring(0, 10)}...`);
      // 設計書通り常に200を返す
      return res.json({ ok: true });
    }
    
    console.log(`[${new Date().toISOString()}] INFO: LINE署名検証成功`);

    // Webhook処理
    const { events = [] } = req.body;
    console.log(`[${new Date().toISOString()}] INFO: イベント処理開始 - 受信イベント数: ${events.length}`);
    
    for (const event of events) {
      console.log(`[${new Date().toISOString()}] INFO: イベント処理 - type: ${event.type}, userId: ${event.source?.userId}`);
      
      if (event.type === 'follow') {
        console.log(`[${new Date().toISOString()}] INFO: followイベント検出 - キューに追加開始`);
        
        // 非同期ジョブをキューに追加
        await req.queue.linkFollow.add('link_follow', {
          mode: process.env.ONBOARDING_MODE || 'silent',
          userId: event.source.userId,
          replyToken: event.replyToken,
          eventTs: event.timestamp
        });
        
        console.log(`[${new Date().toISOString()}] INFO: followイベント - キュー追加完了`);
      }
    }

    res.json({ ok: true });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR: LINE Webhook処理エラー:`, error);
    // 設計書通り常に200を返す
    res.json({ ok: true });
  }
});

// 署名検証
function verifySignature(body, channelSecret, signature) {
  // 開発環境では署名検証をスキップ
  if (process.env.DEV_ALLOW_INSECURE === '1') {
    console.log(`[${new Date().toISOString()}] WARN: DEV: Signature verification skipped`);
    return true;
  }
  
  if (!signature || !channelSecret) {
    console.error(`[${new Date().toISOString()}] ERROR: 署名検証パラメータ不足 - signature: ${!!signature}, channelSecret: ${!!channelSecret}`);
    return false;
  }
  
  try {
    const bodyStr = JSON.stringify(body);
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(bodyStr)
      .digest('base64');
    
    const isValid = signature === hash;
    
    if (!isValid) {
      console.error(`[${new Date().toISOString()}] ERROR: 署名不一致 - 受信: ${signature}, 期待: ${hash}, body長: ${bodyStr.length}`);
    }
    
    return isValid;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ERROR: 署名検証処理エラー:`, error);
    return false;
  }
}

export { router as lineRoutes };