# LINE Messaging API の Flex Message を送るコードサンプル
- chatgptに「025_メッセージ送信APIのサンプル.md」、「026_メッセージ送信APIのサンプル.md」を渡した結果です。

添付のメモと要望を踏まえ、\*\*“正しいサンプルを確認→そのまま貼って動く”\*\*をゴールに、SDK版とHTTP直叩き版の最小サンプル＆公式リンクをまとめました。まずは SDK でいきましょう（難しければ下に axios 版も用意）。

# これだけやれば送れる（SDK版・Node.js）

```bash
npm i @line/bot-sdk
```

```js
// send-flex.js
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, // .envに入れる
});

const flex = {
  type: 'flex',
  altText: 'Flex sample',
  contents: {
    type: 'bubble',
    hero: {
      type: 'image',
      url: 'https://example.com/hero.jpg', // ←必ず https
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: 'Hello, Flex!', weight: 'bold', size: 'xl' }],
    },
  },
};

// 単一ユーザにPush
export async function pushFlex(userId) {
  await client.pushMessage(userId, flex);
}

// 複数ユーザにMulticast（ユーザID配列）
export async function multicastFlex(userIds) {
  await client.multicast(userIds, flex);
}

// Webhook返信として送る
export async function replyFlex(replyToken) {
  await client.replyMessage(replyToken, [flex]);
}
```

> ポイント（エラー潰し）
>
> * `hero.url` は **https 必須**（httpやdataはNG → `invalid uri scheme` の典型原因）。([GitHub][1], [LINE Developers][2])
> * Flexは **`{type:'flex', altText, contents:{...bubble...}}`** のラップ構造が正解（SimulatorのJSONは `contents` に入れる）。([LINE Developers][3])
> * 公式SDKの導入・基本はここ（Node.js 公式ドキュメント & APIリファレンス）。([line.github.io][4], [LINE Developers][5])
> * **multicast のレート制限は2025/04/23に変更**（数値はアカウント条件で異なるため最新ニュース参照）。([LINE Developers][6])

# 公式ドキュメント・サンプル（ClaudeCodeに渡す用）

* Node.js SDK（GitHub / API Docs）([GitHub][7], [line.github.io][8])
* Flex Message（使い方・要素・Simulator）([LINE Developers][3])
* Messaging API リファレンス（push / multicast / validate など）([LINE Developers][5])
* （参考）“invalid uri scheme” 事例（hero/urlがhttpのとき）([GitHub][1])

# HTTP直叩き（axios版）

SDKを使わない最小例です（CIやワンショット検証用に便利）。

```bash
npm i axios
```

```js
// send-flex-axios.js
import axios from 'axios';

const LINE_API = 'https://api.line.me/v2/bot/message';
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
};

const flex = {
  type: 'flex',
  altText: 'Flex sample',
  contents: {
    type: 'bubble',
    hero: {
      type: 'image',
      url: 'https://example.com/hero.jpg', // https 必須
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    },
    body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'Hello!' }] },
  },
};

export async function push(userId) {
  await axios.post(`${LINE_API}/push`, { to: userId, messages: [flex] }, { headers });
}

export async function multicast(userIds) {
  await axios.post(`${LINE_API}/multicast`, { to: userIds, messages: [flex] }, { headers });
}

export async function reply(replyToken) {
  await axios.post(`${LINE_API}/reply`, { replyToken, messages: [flex] }, { headers });
}
```

# 添付の要点を反映しています

* 「**正しいJSON構造**と**hero画像はhttps必須**」「**multicast送信**の具体例」「**公式のSDK/Simulator**を使う流れ」を重視して整理（添付の依頼メモに沿って抜けがない形）。
* Node.jsでの**動作するFlex送信コード**を提示し、**GitHub/公式ドキュメントのURL**参照方針も明記（Claudeに丸投げしやすい形）。
* 実装時にハマりやすい箇所（`invalid uri scheme`／ラップ構造／multicastの使い分け）を先回りで注意点化。

---

このまま **`send-flex.js` をClaudeCodeに貼り、`.env` に `CHANNEL_ACCESS_TOKEN` を入れて `pushFlex('U...')` を実行**すれば送れます。
必要なら、Simulator で作った JSON をそのまま `contents` に差し替えて運用してください（レイアウト検証→貼り付け→即送信の流れが最速）。([LINE Developers][3])

他に「このテンプレのhero/body/footerをRC用にこうしてほしい」など仕様があれば、こちらで**完成JSON**を作ってお渡しします。

[1]: https://github.com/line/line-bot-sdk-python/issues/314?utm_source=chatgpt.com "cannot reply as flex message #314 - line/line-bot-sdk-python"
[2]: https://developers.line.biz/en/docs/messaging-api/flex-message-elements/?utm_source=chatgpt.com "Flex Message elements | LINE Developers"
[3]: https://developers.line.biz/en/docs/messaging-api/using-flex-messages/?utm_source=chatgpt.com "Send Flex Messages | LINE Developers"
[4]: https://line.github.io/line-bot-sdk-nodejs/ "LINE Messaging API SDK for nodejs | line-bot-sdk-nodejs"
[5]: https://developers.line.biz/en/reference/messaging-api/?utm_source=chatgpt.com "Messaging API reference - LINE Developers"
[6]: https://developers.line.biz/en/news/3/ "LINE Developers"
[7]: https://github.com/line/line-bot-sdk-nodejs?utm_source=chatgpt.com "line/line-bot-sdk-nodejs: LINE Messaging API SDK for ..."
[8]: https://line.github.io/line-bot-sdk-nodejs/?utm_source=chatgpt.com "LINE Messaging API SDK for nodejs"
