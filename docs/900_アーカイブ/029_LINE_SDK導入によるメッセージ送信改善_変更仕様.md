# LINE SDK導入によるメッセージ送信改善 - 変更仕様書

## 変更概要
管理画面からのイベント作成時のLINEメッセージ送信を、公式SDK（@line/bot-sdk）を使用した実装に変更し、エラー耐性と保守性を向上させる。

## 変更理由
- 現在発生している「invalid uri scheme」エラーの根本解決
- 公式SDKによる安定した実装への移行
- エラーハンドリングの改善
- コードの保守性向上（モジュール分割）

## 環境情報
- **ローカル環境設定**: `/home/admini/projects/rcline/.env`
- **VPS環境設定**: `/home/admini/projects/rcline/.env.production` (手動更新要)
- **環境変数名**: `LINE_CHANNEL_ACCESS_TOKEN`（既存）

## 変更内容

### 1. 依存関係の追加
```bash
cd /home/admini/projects/rcline/services/api-server
npm install @line/bot-sdk
```

### 2. 新規ファイル作成

#### 2.1 `/services/api-server/src/line/flex-payload.js`
Flex Messageのペイロード構築を担当するモジュール

```javascript
// Flex Messageのペイロード構築
const buildEventFlexMessage = ({ title, description, imageUrl, liffUrl, heldAt }) => {
  const message = {
    type: 'flex',
    altText: `${title} - 出欠確認`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: heldAt,
            size: 'sm',
            color: '#666666',
            margin: 'md'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            height: 'sm',
            action: {
              type: 'uri',
              label: '出欠を回答',
              uri: liffUrl
            }
          }
        ]
      }
    }
  };

  // hero画像がある場合は追加
  if (imageUrl) {
    message.contents.hero = {
      type: 'image',
      url: imageUrl,  // 必ずhttps://で始まるURL
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover'
    };
  }

  return message;
};

module.exports = { buildEventFlexMessage };
```

#### 2.2 `/services/api-server/src/line/line-client.js`
LINE SDK クライアントと送信ロジック

```javascript
const { Client } = require('@line/bot-sdk');
const { buildEventFlexMessage } = require('./flex-payload');

// SDKクライアント初期化
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// マルチキャスト送信（分割対応）
async function sendEventMulticast({ lineUserIds, title, description, imageUrl, liffUrl, heldAt }) {
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
}

module.exports = { sendEventMulticast };
```

### 3. 既存ファイルの修正

#### 3.1 `/services/api-server/src/routes/admin.js`
送信処理部分をSDK版に置き換え（行889-1000付近）

```javascript
// 冒頭に追加
const { sendEventMulticast } = require('../line/line-client');

// 既存の送信処理を以下に置き換え（行889付近から）
// LIFFメッセージを構築
const liffUrl = `https://awf.technavigation.jp/rcline/?eventId=${eventId}`;

// 画像URLを完全なURLに変換（httpsスキーム必須）
const fullImageUrl = event.image_url 
  ? `https://awf.technavigation.jp/rcline${event.image_url}`
  : null;

// 日時をフォーマット
const heldAtDate = new Date(event.held_at);
const formattedDate = heldAtDate.toLocaleDateString('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo'
});

// SDK経由で送信
try {
  const result = await sendEventMulticast({
    lineUserIds,
    title: event.title,
    description: '',  // 必要に応じて本文追加
    imageUrl: fullImageUrl,
    liffUrl,
    heldAt: formattedDate
  });
  
  console.log(`[LIVE] LINE送信完了: 成功${result.success}件、失敗${result.fail}件`);
  
  // 送信統計を記録（既存のコード流用）
  const statsSql = `
    INSERT OR REPLACE INTO event_push_stats (event_id, success_count, fail_count, last_sent_at)
    VALUES (?, ?, ?, ?)
  `;
  
  req.db.run(statsSql, [
    eventId,
    result.success,
    result.fail,
    nowJST()
  ], (err) => {
    if (err) {
      req.db.run('ROLLBACK');
      return reject(err);
    }
    
    req.db.run('COMMIT');
    resolve({
      event_id: eventId,
      targets: memberIds.length,
      push: result
    });
  });
} catch (error) {
  console.error('[LIVE] LINE送信で予期しないエラー:', error);
  req.db.run('ROLLBACK');
  reject(error);
}
```

## テスト手順

1. **SDK インストール確認**
   ```bash
   cd /home/admini/projects/rcline/services/api-server
   npm list @line/bot-sdk
   ```

2. **Dockerコンテナ再起動**
   ```bash
   docker compose restart api-server
   ```

3. **管理画面からテスト送信**
   - https://awf.technavigation.jp/rcline/admin-demo.html
   - イベント作成フォームから送信
   - 画像は必ずJPG形式でアップロード

4. **ログ確認**
   ```bash
   docker compose logs -f api-server | grep "LINE SDK"
   ```

## 成功条件
- ✅ 「invalid uri scheme」エラーが解消
- ✅ Flex Messageが正常に送信される
- ✅ 画像付きメッセージが表示される
- ✅ 150件を超える宛先でも分割送信される
- ✅ 成功/失敗件数が正しく記録される

## ロールバック手順
問題が発生した場合は、`/src/routes/admin.js`の変更を元に戻し、`/src/line/`ディレクトリを削除する。

## 今後の改善案
- エラー時のリトライ機能
- 送信履歴の詳細ログ保存
- テンプレート化による柔軟なメッセージ構築