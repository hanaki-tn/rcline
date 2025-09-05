了解です。ご指定どおり、前段に「基本（公式リンク付き & サンプルJSON）」を置き、その後に先ほどの雛形を“理解しやすく”流し込みました。
そのまま `133_Webhookハンドラ設計.md` として保存して使えます。

---

# 133\_Webhookハンドラ設計.md

## 0. このドキュメントの位置づけ

* 本書は、**LINE Messaging API の Webhook を受ける共通基盤**（受信〜検証〜分配〜永続化〜送信）の設計をまとめたものです。
* 先に「基本」を押さえ、続いて **共通ライフサイクル/責務分担/イベント別仕様** を整理します。
* 公式仕様に準拠しています（リンクは下記／各節に記載）。

---

## 1. 基本（まずここだけ読めば流れが掴める）

### 1.1 Webhook とは何か（超要約）

* ユーザーが**友だち追加**・**メッセージ送信**・**ボタン押下（postback）** などをすると、LINEプラットフォームが **Webhook URL（当システムの `/api/line/webhook`）** に **HTTPS POST** を送ってきます。公式説明。 ([LINE Developers][1])
* Webhook を受けるには、LINE Developers Console で **Use webhook** を **有効化** しておきます（必要なら**Webhook redelivery** もON）。 ([LINE Developers][2])

### 1.2 セキュリティ（署名検証）

* LINEは送信時に、**リクエストボディ × Channel secret を鍵に HMAC-SHA256** で署名を作り、**`x-line-signature` ヘッダ**に入れて送ってきます。受信側は**同じ手順で再計算し一致チェック**します。 ([LINE Developers][3])

### 1.3 主なイベント種別（今回の対象）

* **follow**：友だち追加で発火（初回起点の自動紐づけなど）
* **unfollow**：ブロックで発火（配信対象からの除外など）
* **message (text)**：ユーザーがテキスト送信
* **postback**：テンプレ/ボタン等のアクションで**サーバーに隠しパラメータ**が飛ぶ（出欠ボタン向き） ([LINE Developers][1])

> 参考：公式SDK（Node.js 他）とサンプルは**公式配布**があります。開発時はまずこれをベースに。 ([LINE Developers][4], [GitHub][5], [line.github.io][6])

---

## 2. 公式ドキュメント（ブックマーク推奨）

* **Receive messages (Webhook)**：Webhookの受け方（設定/再配信）
  [https://developers.line.biz/en/docs/messaging-api/receiving-messages/](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) ([LINE Developers][2])
* **Messaging API Reference（Webhooks）**：イベントが来る仕組み・ヘッダ・本文・レスポンス
  [https://developers.line.biz/en/reference/messaging-api/](https://developers.line.biz/en/reference/messaging-api/) （“Webhooks”章） ([LINE Developers][1])
* **Verify webhook signature**：`x-line-signature` 検証（HMAC-SHA256）
  [https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) ([LINE Developers][3])
* **Actions / Postback**：postback の仕様（ボタン→サーバーに送られるデータ）
  [https://developers.line.biz/en/docs/messaging-api/actions/](https://developers.line.biz/en/docs/messaging-api/actions/) （“Postback action”） ([LINE Developers][7])
* **SDK一覧（公式）**：言語別SDKとサンプル
  [https://developers.line.biz/en/docs/messaging-api/line-bot-sdk/](https://developers.line.biz/en/docs/messaging-api/line-bot-sdk/) ([LINE Developers][4])

> ※ユーザーのLIFFログインやIDトークン検証は **LINE Login / OIDC** 側の仕様（必要時に参照）。 ([LINE Developers][8])

---

## 3. Webhook リクエストのサンプル（実物の“カタチ”）

> 公式フォーマットに沿った**最小サンプル**です。実際はフィールドが増減することがあります（公式リファレンスを優先）。 ([LINE Developers][1])

### 3.1 follow（友だち追加）

```json
{
  "destination": "xxxxxxxxxx",
  "events": [
    {
      "type": "follow",
      "mode": "active",
      "timestamp": 1735912345678,
      "source": { "type": "user", "userId": "Uxxxxxxxxxxxxxx" },
      "replyToken": "abcdef...12345"
    }
  ]
}
```

### 3.2 unfollow（ブロック）

```json
{
  "destination": "xxxxxxxxxx",
  "events": [
    {
      "type": "unfollow",
      "mode": "active",
      "timestamp": 1735912345678,
      "source": { "type": "user", "userId": "Uxxxxxxxxxxxxxx" }
    }
  ]
}
```

### 3.3 message（text）

```json
{
  "destination": "xxxxxxxxxx",
  "events": [
    {
      "type": "message",
      "mode": "active",
      "timestamp": 1735912345678,
      "source": { "type": "user", "userId": "Uxxxxxxxxxxxxxx" },
      "replyToken": "abcdef...12345",
      "message": {
        "id": "1234567890123",
        "type": "text",
        "text": "こんにちは"
      }
    }
  ]
}
```

### 3.4 postback（ボタン押下）

```json
{
  "destination": "xxxxxxxxxx",
  "events": [
    {
      "type": "postback",
      "mode": "active",
      "timestamp": 1735912345678,
      "source": { "type": "user", "userId": "Uxxxxxxxxxxxxxx" },
      "replyToken": "abcdef...12345",
      "postback": {
        "data": "action=attend&eventId=E20250911",
        "params": { }
      }
    }
  ]
}
```

* postback の `data` に、**サーバーが解釈するクエリ（例：action / eventId）** を入れます。 ([LINE Developers][7])

---

## 4. Webhook 共通ライフサイクル（基盤設計）

> 以降は\*\*実装の“型”\*\*です。Claude/実装者が迷わない粒度に絞っています。
> 不明・要判断は《※要決定》で明示。

### 4.1 目的とスコープ

* LINE Messaging API Webhook の **共通ライフサイクル** と **責務境界** を定義
* 対象イベント：**follow / unfollow / message(text) / postback**（必要に応じて拡張）

### 4.2 エンドポイント

* URL：`POST /api/line/webhook`（HTTPS必須）
* ヘッダ：`x-line-signature`（**要検証**） ([LINE Developers][1])
* タイムアウト：**10秒以内に 200** を返す（重処理は非同期化） ([LINE Developers][1])

### 4.3 受信〜処理ライフサイクル（共通フロー）

1. **署名検証**：ボディ＋Channel secret でHMAC-SHA256、`x-line-signature` と比較（不一致→403） ([LINE Developers][3])
2. **イベント展開**：`events[]` を順に処理（無い/空→400） ([LINE Developers][1])
3. **冪等性**：`eventId` 相当（イベント固有の識別子）で**重複排除**（DBユニーク/キャッシュ）

   * 《※要決定》LINEイベントIDの保持方法（公式イベントには`webhookEventId`が付与されます。導入推奨） ([LINE Developers][1])
4. **ルーティング**：`event.type`で follow / unfollow / message / postback ハンドラへ
5. **ハンドラ処理**：認証（必要時）→業務ロジック→DB書込→送信（reply/push）

   * **reply は1回のみ**（`replyToken`は1度きり）《※要確認：実装で保証》 ([LINE Developers][1])
6. **ACK**：処理の成否に関わらず**200**（内部失敗はDLQ/再試行で吸収）

> メモ：重い処理・外部I/Oは**ジョブキュー**に積む（Webhookは**最短ACK**が原則）。

### 4.4 責務分担（レイヤリング）

* **Webhook Controller**：署名検証／パース／最短ACK
* **Event Router**：type別ディスパッチ
* **Domain Service**：業務ロジック（自動紐づけ・出欠更新 等）
* **Repository**：DB I/O（トランザクション・ユニーク制約・監査）
* **Sender**：Messaging API呼び出し（レート制御・再試行キュー）

（参考RACI）

| 処理                 | Controller | Router | Domain | Repo | Sender |
| ------------------ | ---------- | ------ | ------ | ---- | ------ |
| 署名検証               | R          |        |        |      |        |
| イベント分配             |            | R      |        |      |        |
| 自動紐づけ（follow）      |            |        | R      | C/R  |        |
| 出欠確定保存（postbackなど） |            |        | R      | R    |        |
| 返信（reply）/Push送信   |            |        | C      |      | R      |

---

## 5. イベント別ハンドラ仕様（最小）

### 5.1 follow

* 入力：`source.userId`, `replyToken`
* 処理：

  1. 会員突合（例：`name_key`や既存リンク）
  2. **サイレント自動紐づけ**の判定・実行（閾値や例外の扱いは別紙）
  3. 監査ログ記録
  4. 必要に応じ `replyMessage`（初回案内など）
* 注意：replyは**1回**まで。大量連鎖処理は**非同期**へ。 ([LINE Developers][1])

### 5.2 unfollow

* 入力：`source.userId`
* 処理：会員フラグ更新（配信対象から除外）＋監査
* 送信：なし（replyTokenは通常無し）

### 5.3 message（text）

* 入力：`message.text`
* 処理：今回システムでは**業務トリガーに使わない方針**（スコープ外）。

  * 例外：ヘルプワードやキーワードでの**導線**を作る場合は別紙。

### 5.4 postback

* 入力：`postback.data`（例：`action=attend&eventId=...`）
* 処理：

  1. 入力検証（イベント存在・権限・期限）
  2. `attendances`にUPSERT（追記履歴）
  3. 任意で `replyMessage` or `pushMessage`（確認通知）
* 参考：postback の仕様・使い方。 ([LINE Developers][7])

---

## 6. トランザクション境界と冪等性

* **冪等キー**：`webhookEventId`（推奨）や（event内容のハッシュ）をユニークに保持し、**二重処理を防止**。 ([LINE Developers][1])
* **境界**：業務テーブル更新と監査ログは**同一トランザクション**で整合性確保。
* **送信の分離**：Messaging API 送信（push/multicast）は**ジョブ化**して再試行可能に。

---

## 7. エラーハンドリング／再試行

* **Webhook処理失敗**：DLQ（Dead Letter Queue）へ退避し、別ワーカーで再処理。
* **Messaging API 呼び出し失敗**：指数バックオフ／最大回数／失敗ログ。
* **ACK原則**：WebhookのHTTP応答は**基本200**（外部要因でLINE側再送を招かない）。

> 《※運用方針》LINE側の**Webhook redelivery** をONにしている場合、**200以外**だと**再配信**されます。内部再試行と二重処理に注意。 ([LINE Developers][2])

---

## 8. ログ／メトリクス

* **構造化ログ**：`webhookEventId`, `type`, `userId`, `handler`, `latency_ms`, `result`
* **個人情報保護**：表示名や自由入力は**マスク/要約**して保存
* **メトリクス**：検証失敗率、処理遅延、キュー滞留数、送信成功率

---

## 9. セキュリティ

* **機密管理**：Channel secret / Access token は**ENV**管理（権限最小化）
* **署名検証必須**：開発中にスキップする場合は**本番厳禁**（フラグで制御） ([LINE Developers][3])
* **リプレイ対策**：`timestamp`の許容窓／`webhookEventId`の**一意消費**

---

## 10. テスト観点（最小セット）

* **署名検証ユニット**：公式手順どおりのHMAC一致テスト。 ([LINE Developers][3])
* **イベントモック**：follow / postback のサンプル投入テスト。 ([LINE Developers][1])
* **冪等性**：同一イベント2連投で**DB重複が起きない**こと。
* **パフォーマンス**：同時多イベント時も**10秒以内に200**を維持。 ([LINE Developers][1])

---

## 付録A：実装方針メモ（Node.js想定）

* まずは**公式SDK**（`@line/bot-sdk`）の**基本サンプル**から開始することを推奨（署名検証・ルータ・返信周りが整っているため）。 ([LINE Developers][4], [line.github.io][6])
* postbackボタンなどのUIを作る場合は、**postback action** の仕様に合わせて `data` を設計（`action=...&eventId=...` 等）。 ([LINE Developers][7])
---

## 付録B：署名検証サンプルコード（x-line-signature）

> 要点：**JSONにパースする前の“生のボディ（raw body）”** に対して **HMAC-SHA256（鍵は Channel secret）→ Base64** を計算し、リクエストヘッダ **`x-line-signature`** と比較する。
> Webhookは**10秒以内にHTTP 200**を返す（重処理はキューなどで非同期化）。

### B-1. Aパターン：素の Express で“生ボディ”を使って自前検証

```ts
// server.ts (or server.js)
import express from "express";
import crypto from "crypto";

const app = express();

// ★重要★: 署名検証は「生のボディ」が必要。
// express.json() の verify オプションで rawBuffer を保持する。
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf; // 後でHMAC計算に使用
  }
}));

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!; // 環境変数で管理

function isValidLineSignature(rawBody: Buffer, signatureHeader?: string): boolean {
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac("sha256", CHANNEL_SECRET);
  hmac.update(rawBody);
  const digest = hmac.digest("base64");
  // タイミング攻撃対策の固定時間比較
  const a = Buffer.from(signatureHeader, "utf8");
  const b = Buffer.from(digest, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post("/api/line/webhook", (req: any, res) => {
  const signature = req.get("x-line-signature");

  // 1) 署名検証（不一致は 403）
  if (!isValidLineSignature(req.rawBody, signature)) {
    return res.status(403).send("Invalid signature");
  }

  // 2) ここからは JSON を信頼して処理してよい
  const body = req.body;
  if (!body?.events || !Array.isArray(body.events)) {
    return res.status(400).send("Bad request");
  }

  // 3) 最短ACK原則（重い処理は非同期へ）
  for (const event of body.events) {
    // event.type: "follow" | "unfollow" | "message" | "postback" など
    // ここで type ルーティング → ドメイン処理へ
  }

  return res.sendStatus(200);
});

app.listen(4000, () => {
  console.log("LINE webhook server listening on :4000");
});
```

**ポイント**

* `express.json({ verify })` で **rawBody** を確保する（これが無いと失敗しがち）
* `digest("base64")` を使う（`hex` では一致しない）
* HMAC鍵は **Channel secret**（アクセストークンではない）

---

### B-2. Bパターン：公式 SDK（@line/bot-sdk）のミドルウェアで検証（推奨）

```ts
// server-sdk.ts
import express from "express";
import { middleware, Client, MiddlewareConfig } from "@line/bot-sdk";

const config: MiddlewareConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET!,          // 署名検証用
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN! // 送信用
};

const app = express();

// ★ミドルウェアが署名検証 + ボディパースを実施
app.post("/api/line/webhook", middleware(config), async (req, res) => {
  const events = (req as any).body.events;

  // ここで events を type ルーティングして処理
  // 例: for (const ev of events) handleEvent(ev);

  return res.sendStatus(200);
});

// 送信用クライアント（reply/push など）
export const lineClient = new Client(config);

app.listen(4000, () => console.log("LINE webhook (SDK) listening on :4000"));
```

**ポイント**

* 自前HMAC実装が不要になり、**設定ミスのリスクが減る**
* 既存実装に組み込みやすい（ミドルウェアで/route単位に適用可能）

---

### B-3. 動作確認とチェックリスト

**最小確認**

* サーバ起動 → LINE Developers の「Webhookの接続確認」を実行
  → 署名OKなら **HTTP 200** が返る

**ハマりやすい点**

* **raw body 不使用**（JSON化後をHMACにかけるとNG）
* **Base64 比較忘れ**（`hex` で比較してしまう）
* **秘密の取り違え**（**Channel secret** を使う）
* **ヘッダ名の誤り**（`x-line-signature`）
* **遅延**（10秒以内に200、重処理はキューへ）

---

> 付記：本番では署名検証スキップを**禁止**し、秘密情報はENVやSecret Managerで管理してください。

---

## 未確定事項（このドキュメントの改善TODO）

* 《要決定》冪等キーの正式採用：`webhookEventId` を**主キー**にするか、独自ハッシュにするか。 ([LINE Developers][1])
* 《要決定》reply の使用方針：**どのイベントで返信を使うか**（replyは**1回制約**） ([LINE Developers][1])
* 《要決定》**message(text)** を今回スコープ外にし続けるか、**キーワードヘルプ**等の軽機能を許容するか。

---

[1]: https://developers.line.biz/en/reference/messaging-api/?utm_source=chatgpt.com "Messaging API reference - LINE Developers"
[2]: https://developers.line.biz/en/docs/messaging-api/receiving-messages/?utm_source=chatgpt.com "Receive messages (webhook) - LINE Developers"
[3]: https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/?utm_source=chatgpt.com "Verify webhook signature - LINE Developers"
[4]: https://developers.line.biz/en/docs/messaging-api/line-bot-sdk/?utm_source=chatgpt.com "LINE Messaging API SDKs"
[5]: https://github.com/line/line-bot-sdk-nodejs?utm_source=chatgpt.com "line/line-bot-sdk-nodejs: LINE Messaging API SDK for ..."
[6]: https://line.github.io/line-bot-sdk-nodejs/getting-started/install.html?utm_source=chatgpt.com "Install | line-bot-sdk-nodejs"
[7]: https://developers.line.biz/en/docs/messaging-api/actions/?utm_source=chatgpt.com "Actions | LINE Developers"
[8]: https://developers.line.biz/en/docs/line-login/verify-id-token/?utm_source=chatgpt.com "Get profile information from ID tokens | LINE Developers"
