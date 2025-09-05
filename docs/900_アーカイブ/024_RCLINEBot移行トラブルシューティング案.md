# RC LINE Bot 移行トラブルシューティング案

ここまでで分かったことと、次の“一気に確定させる”手順を整理します。結論から言うと、①配線（Caddy→api-server）は概ねOKそう、②ただし**アクセスログ未出力**のため見えない、③**パス/署名検証**のどちらかで弾いている可能性が高い、です。

---

# まず読んだ事実（あなたの出力から）

* 80/443 は **docker-proxy がListen**、`caddy`コンテナも **:80/:443 を公開**→外向きポートOK。
* Caddy は `awf.technavigation.jp` の **証明書取得＆自動更新**が動作（ACMEの更新ログ多数）→**TLSは生きてる**。
* LINE Developers:

  * **Webhook URL**: `https://awf.technavigation.jp/api/line/webhook`
  * **Use webhook = ON**、**Verify = ○（直近）** → LINE→VPS の疎通は取れている見込み。
* Caddyfile.vps（要点）：

  * `/api/*` → **api-server:4000** にリバプロ（**strip なし**）
  * 既存の `linehook` 用に `/linehook/*` → linehook:3000（移行完了まで保持）
  * **サイト配下のアクセスログ出力が未設定**（`log` なし）

👉 ここから推測できる“ハマり所”は2つに絞れます：

1. **パス不一致**

   * Caddyは `/api/*` を **そのまま** upstream に転送（strip していない）。
   * つまり **上流の api-server は `/api/line/webhook` というパス**で受ける必要があります。
   * もし api-server 側の実装が `/line/webhook` で待っているなら **404/405** になり、（署名検証前で）**アプリ側ログは出ない**ことが多い。
2. **署名検証の順序問題**（Expressの超あるある）

   * `express.json()` などで**先にボディをパース**→“生ボディ”が失われ **HMAC検証が毎回失敗**→401/403→**イベント処理のログが出ない**。
   * LINEの「Verify」はヘッダ・ボディが簡易なため、**緩い実装でも200返してしまい○になる**ことがあります（本番の follow だけ落ちる）。

---

# すぐ確定できるミニ手順（コピペ用）

## ① Caddy に一時的にアクセスログを出す（“来た/来ない”の可視化）

Caddyfile.vps の `awf.technavigation.jp { ... }` の最上部に **1行**足すだけ：

```
awf.technavigation.jp {
    log
    ...
}
```

反映：

```bash
docker compose exec caddy caddy fmt --overwrite /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --force
docker compose logs -f caddy
```

→ これで **/api/line/webhook に来たか**が即わかります。

## ② upstream とアプリの“パス”を確定

Caddy から upstream に直接叩きます（**Caddy→api-server**配線＆**パス存在**の両方を検証）：

```bash
# Caddy コンテナ内 → api-server へ
docker compose exec caddy sh -lc 'apk add --no-cache curl >/dev/null 2>&1 || true; \
  echo "--- /api/line/webhook"; curl -i http://api-server:4000/api/line/webhook -X POST -d "{}"; \
  echo; echo "--- /line/webhook"; curl -i http://api-server:4000/line/webhook -X POST -d "{}"'
```

* **/api/line/webhook が 200/4xx 以外（404/405など）** → **api-server 側の実装パスが違う**のが濃厚。
  → 対応案A：api-server のルートを `/api/line/webhook` に合わせる
  → 対応案B：Caddy 側で `handle_path /api/* { uri strip_prefix /api; reverse_proxy api-server:4000 }` に変更し、アプリを `/line/webhook` のまま受ける。

## ③ アプリに“到達ログ”を署名検証**前**に1行だけ入れる

（ここで“全く出ない”なら、Caddyまでは来てても**アプリのパスが違う**／**別サービスで受けている**）

```js
app.post('/api/line/webhook', express.raw({ type: '*/*' }), (req, res, next) => {
  console.log('[IN]', req.method, req.path, 'sig:', !!req.headers['x-line-signature']);
  // ここで verifySignature(req) する。失敗時もログを1行出す
  res.sendStatus(200); // まずは即200（重い処理は非同期へ）
});
```

> 重要：**raw → verify → その後に JSON 化**の順序に。

## ④ 外から自分で叩く（DNS/TLS/ルーティングを実地確認）

```bash
curl -i https://awf.technavigation.jp/api/line/webhook -X POST -d '{}'
```

* Caddy のログに出るなら、**LINEのPOSTも同様に出るはず**（=見える化完了）

---

# “もし”の分岐と直し方

### A) **パス不一致**だった場合

* **Caddyでstripする**案：

  ```caddy
  handle_path /api/* {
      uri strip_prefix /api
      reverse_proxy api-server:4000
  }
  ```

  これで upstream には `/line/webhook` として届く。
* **アプリ側を合わせる**案：
  ルートを `/api/line/webhook` に揃える。
  どちらでもOKですが、\*\*Caddy側で責務分離（/api 配下→strip→上流）\*\*の方が後々混乱しにくいです。

### B) \*\*署名検証エラー（生ボディ問題）\*\*だった場合

* `express.json()` や `bodyParser.json()` を**先に**入れていないか確認。
* Webhookルートでは **必ず raw** を最初に噛ませ、**そこでHMAC**、OKなら `JSON.parse(req.body)` する。
* 失敗時は `console.warn('[VERIFY_FAIL]', ...)` を**1行だけ**出す（ボディは出さない）。

---

# 追加で“1回だけ”見せてもらえると、確定がさらに早い3点

（伏字OK／そのまま貼りでOK）

1. **api-server の Webhook ルート定義**（どのパスで待っているか）
2. **Webhook直前のミドルウェア構成**（`express.json()` 等が前にないか）
3. **Caddyアクセスログの1〜2行**（`curl` 叩いた時の行でOK）

---

# いまの状況に対する私の暫定結論（確度順）

1. **パスのズレ**（Caddyはstripなしで `/api/line/webhook` を上流へ → アプリが `/line/webhook` を待っていて不一致）。
2. **署名検証の順序**でHMAC失敗→“呼ばれてないように見える”。

上の②③④をやれば、どちらか**必ず**表に出ます。
まずは Caddy に `log` を足して、②の **/api/line/webhook / /line/webhook** 直叩き結果を教えてください。そこまで来れば、設定 or コードの**どちらを直すか**まで即断できます。








# VPS環境で実行した結果
ありがとうございます。取り急ぎ②まで行いました。
① Caddy に一時的にアクセスログを出す（“来た/来ない”の可視化）
---
root@x162-43-19-162:/opt/rcline/caddy# nano Caddyfile
root@x162-43-19-162:/opt/rcline/caddy# docker compose exec caddy caddy fmt --overwrite /etc/caddy/Caddyfile^C
root@x162-43-19-162:/opt/rcline/caddy#
root@x162-43-19-162:/opt/rcline/caddy#
root@x162-43-19-162:/opt/rcline/caddy#
root@x162-43-19-162:/opt/rcline/caddy# cd ..
root@x162-43-19-162:/opt/rcline#
root@x162-43-19-162:/opt/rcline#
root@x162-43-19-162:/opt/rcline# docker compose exec caddy caddy fmt --overwrite /etc/caddy/Caddyfile
WARN[0000] /opt/rcline/docker-compose.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion
root@x162-43-19-162:/opt/rcline#
root@x162-43-19-162:/opt/rcline# docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --force
WARN[0000] /opt/rcline/docker-compose.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion
2025/08/27 05:20:41.473 INFO    using config from file  {"file": "/etc/caddy/Caddyfile"}
2025/08/27 05:20:41.499 INFO    adapted config to JSON  {"adapter": "caddyfile"}
root@x162-43-19-162:/opt/rcline#
root@x162-43-19-162:/opt/rcline# docker compose logs -f caddy
WARN[0000] /opt/rcline/docker-compose.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion
caddy-1  | {"level":"info","ts":1756131348.621782,"msg":"maxprocs: Leaving GOMAXPROCS=4: CPU quota undefined"}
caddy-1  | {"level":"info","ts":1756131348.62227,"msg":"GOMEMLIMIT is updated","package":"github.com/KimMachineGun/automemlimit/memlimit","GOMEMLIMIT":3686484787,"previous":9223372036854775807}
caddy-1  | {"level":"info","ts":1756131348.6224582,"msg":"using config from file","file":"/etc/caddy/Caddyfile"}
caddy-1  | {"level":"info","ts":1756131348.6248367,"msg":"adapted config to JSON","adapter":"caddyfile"}
caddy-1  | {"level":"warn","ts":1756131348.6249754,"msg":"Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies","adapter":"caddyfile","file":"/etc/caddy/Caddyfile","line":2}
caddy-1  | {"level":"info","ts":1756131348.6272125,"logger":"admin","msg":"admin endpoint started","address":"localhost:2019","enforce_origin":false,"origins":["//localhost:2019","//[::1]:2019","//127.0.0.1:2019"]}
caddy-1  | {"level":"info","ts":1756131348.6276436,"logger":"http.auto_https","msg":"server is listening only on the HTTPS port but has no TLS connection policies; adding one to enable TLS","server_name":"srv0","https_port":443}
caddy-1  | {"level":"info","ts":1756131348.627826,"logger":"http.auto_https","msg":"enabling automatic HTTP->HTTPS redirects","server_name":"srv0"}

---

② upstream とアプリの“パス”を確定
---
root@x162-43-19-162:/opt/rcline# docker compose exec caddy sh -lc 'apk add --no-cache curl >/dev/null 2>&1 || true; \
  echo "--- /api/line/webhook"; curl -i http://api-server:4000/api/line/webhook -X POST -d "{}"; \
  echo; echo "--- /line/webhook"; curl -i http://api-server:4000/line/webhook -X POST -d "{}"'
WARN[0000] /opt/rcline/docker-compose.yml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion
--- /api/line/webhook
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';style-src 'self' 'unsafe-inline';script-src 'self' 'unsafe-inline';script-src-attr 'unsafe-inline';img-src 'self' data:;base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';object-src 'none';upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: SAMEORIGIN
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Access-Control-Allow-Origin: *
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
Date: Wed, 27 Aug 2025 05:22:03 GMT
X-RateLimit-Reset: 1756273024
Content-Type: application/json; charset=utf-8
Content-Length: 11
ETag: W/"b-Ai2R8hgEarLmHKwesT1qcY913ys"
Connection: keep-alive
Keep-Alive: timeout=5

{"ok":true}
--- /line/webhook
HTTP/1.1 404 Not Found
Content-Security-Policy: default-src 'self';style-src 'self' 'unsafe-inline';script-src 'self' 'unsafe-inline';script-src-attr 'unsafe-inline';img-src 'self' data:;base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';object-src 'none';upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=15552000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: SAMEORIGIN
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Access-Control-Allow-Origin: *
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 98
Date: Wed, 27 Aug 2025 05:22:03 GMT
X-RateLimit-Reset: 1756273024
Content-Type: application/json; charset=utf-8
Content-Length: 51
ETag: W/"33-Hu9/d+jJXUGVulD2eTBYv30WNtk"
Connection: keep-alive
Keep-Alive: timeout=5

{"code":"NOT_FOUND","message":"Endpoint not found"}root@x162-43-19-162:/opt/rcline#
---

ログ
---
caddy-1  | {"level":"info","ts":1756272041.590019,"logger":"admin","msg":"stopped previous server","address":"localhost:2019"}
caddy-1  | {"level":"info","ts":1756272042.1048417,"logger":"tls","msg":"storage cleaning happened too recently; skipping for now","storage":"FileStorage:/data/caddy","instance":"58c69ca3-8585-47f2-9029-40dbc53848c7","try_again":1756358442.1048262,"try_again_in":86399.999999399}
caddy-1  | {"level":"info","ts":1756272042.1050048,"logger":"tls","msg":"finished cleaning storage units"}
caddy-1  | {"level":"info","ts":1756272307.0702598,"logger":"http.log.access","msg":"handled request","request":{"remote_ip":"61.211.1.233","remote_port":"1151","client_ip":"61.211.1.233","proto":"HTTP/2.0","method":"GET","host":"awf.technavigation.jp","uri":"/rest/cta/become-creator","headers":{"Sec-Fetch-Mode":["cors"],"Browser-Id":["55a92e50-6411-496f-aa3e-98484c59e727"],"User-Agent":["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"],"Sec-Fetch-Dest":["empty"],"Sec-Ch-Ua-Platform":["\"Windows\""],"Sec-Ch-Ua-Mobile":["?0"],"Cookie":["REDACTED"],"Priority":["u=1, i"],"Accept":["application/json, text/plain, */*"],"Sec-Ch-Ua":["\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\""],"Sec-Fetch-Site":["same-origin"],"Accept-Encoding":["gzip, deflate, br"],"Accept-Language":["en"]},"tls":{"resumed":false,"version":772,"cipher_suite":4865,"proto":"h2","server_name":"awf.technavigation.jp"}},"bytes_read":0,"user_id":"","duration":0.003258775,"size":51,"status":404,"resp_headers":{"Via":["1.1 Caddy"],"X-Frame-Options":["SAMEORIGIN"],"X-Dns-Prefetch-Control":["off"],"X-Ratelimit-Remaining":["99"],"X-Xss-Protection":["0"],"X-Download-Options":["noopen"],"Origin-Agent-Cluster":["?1"],"Content-Length":["51"],"Cross-Origin-Opener-Policy":["same-origin"],"Cross-Origin-Resource-Policy":["same-origin"],"X-Content-Type-Options":["nosniff"],"Strict-Transport-Security":["max-age=15552000; includeSubDomains"],"Content-Type":["application/json; charset=utf-8"],"Etag":["W/\"33-Hu9/d+jJXUGVulD2eTBYv30WNtk\""],"Content-Security-Policy":["default-src 'self';style-src 'self' 'unsafe-inline';script-src 'self' 'unsafe-inline';script-src-attr 'unsafe-inline';img-src 'self' data:;base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';object-src 'none';upgrade-insecure-requests"],"Referrer-Policy":["no-referrer"],"Alt-Svc":["h3=\":443\"; ma=2592000"],"X-Ratelimit-Reset":["1756273208"],"X-Ratelimit-Limit":["100"],"X-Permitted-Cross-Domain-Policies":["none"],"Access-Control-Allow-Origin":["*"],"Date":["Wed, 27 Aug 2025 05:25:07 GMT"]}}
---










# VPS環境で実行した結果から、さらに分析
最高の進捗です。ここまででかなり絞れました。

## ここまでで確定したこと

* **外向き配線はOK**：`awf.technavigation.jp` で 80/443 を Caddy が掴み、証明書も更新できています。
* **Caddy→api-server もOK**：Caddy 経由で `api-server:4000` に到達でき、`/api/line/webhook` は 200 `{"ok":true}`、`/line/webhook` は 404。
  👉 **アプリは `/api/line/webhook` で待受**しており、Caddy 側のパス転送も問題なし。
* **LINE側も到達する前提は満たす**：Webhook URL は `https://awf.technavigation.jp/api/line/webhook`、Use webhook=ON、Verify=○。

ここまで揃うと、残る“動かない理由”は **アプリ層のロジック／署名検証／ログ出力** のどれかです。
とくに「Verify は通るが本番の follow が動かない」は、**署名検証の順序やチャンネル Secret の取り違え**が本当に多いです。

---

## 一気に決着をつける手順（コピペOK）

### 1) api-server 側の **LINE環境変数を確認**（Login 用と取り違えてないか）

> Messaging API の **Channel secret / Access token** を使っている必要があります。
> Login チャネル（LIFF）の ID/Secret を入れると **署名不一致**でハンドラが静かに落ちがち。

```bash
# api-server コンテナ内の環境変数を確認
docker compose exec api-server sh -lc 'printenv | grep -E "LINE_|CHANNEL|SECRET|TOKEN"'
```

* ここで出る `LINE_CHANNEL_SECRET` / `LINE_ACCESS_TOKEN` が **Messaging API のもの**か確認してください。
  （Login チャネルの ID/Secret が混ざっていたらアウトです）

> もし間違いがあれば `.env.production` を修正 → `docker compose up -d --build` で再起動。

---

### 2) **署名検証の順序**を確認（Expressの超あるある）

* Webhook では **「生のボディ（raw）」を先に確保→HMAC検証→その後にJSON化** が必須です。
* `express.json()` / `bodyParser.json()` を**先に**噛ませると、**毎回署名エラー**になります。

**最小の正解パターン（例）**：

```js
// 1) 最初に raw を適用
app.post('/api/line/webhook', express.raw({ type: '*/*' }), (req, res) => {
  try {
    console.log('[IN]', req.method, req.path, 'sig:', !!req.headers['x-line-signature']);
    verifyLineSignature(req); // ← channel secret で HMAC 検証（req.bodyはBuffer）
  } catch (e) {
    console.warn('[VERIFY_FAIL]', e.message);
    return res.sendStatus(401);
  }

  // 2) ここで必要なら JSON に変換
  const body = JSON.parse(req.body.toString('utf8'));

  // 3) events をループして follow 等を処理
  for (const event of body.events || []) {
    console.log('[EVENT]', event.type);
    if (event.type === 'follow') {
      // ← ここでサイレント自動紐づけのロジックを呼ぶ
    }
  }
  // 4) 即 200（重い処理は非同期へ）
  res.sendStatus(200);
});
```

> ※ `verifyLineSignature` 内で `x-line-signature` と **“生ボディ”** を使って HMAC-SHA256 を検証します。

---

### 3) **到達ログ**を必ず“検証前”に 1 行出す

> 「呼ばれてないのか、検証で落ちたのか」の切り分けが一瞬でできます。

上の例の `console.log('[IN]'...)` と `console.warn('[VERIFY_FAIL]'...)` は必ず入れてください。
（今は `{"ok":true}` を返すだけのルート実装に見えるので、**イベント到達の可視化**が必要です）

**ログの見方：**

```bash
docker compose logs -f api-server
# 自分のLINEからボットに「メッセージ送信」や「一旦ブロック→再追加」で follow を発生させる
```

* `[IN] ... sig: true` が出て `VERIFY_FAIL` が出ない → 署名OK、以降の分岐/DBで落ちている
* `[IN] ... sig: false` または `VERIFY_FAIL` → ヘッダ未伝播 or Secret違い or raw順序の問題

---

### 4) Caddyで **アクセスログ**が出ることを再確認（できてます）

もう `log` が有効化されているので、実際に

```bash
curl -i https://awf.technavigation.jp/api/line/webhook -X POST -d '{}'
```

を打つと、Caddy のアクセスログに `/api/line/webhook` が出ます。
→ これで **LINE→Caddy** の到達も可視化できています（Verify でも同様に出るはず）。

---

## ありがちな“最後の一押し”ポイント

* **イベント種別の分岐漏れ**：`event.type === 'follow'` の処理が**未実装**/コメントアウトになっていないか。
* **DB 参照前に落ちている**：`DATABASE_PATH` は `/app/data/rcline.db`、compose では `./rcline.db:/app/data/rcline.db`。
  → ファイル **存在/パーミッション** を確認（`ls -l ./rcline.db` on VPS）。
  → スキーマ差異/NULL制約で例外→200返してても中で失敗しているケースも。
* **レートリミット/CSRF系ミドルウェア**：Webhook ルートにも適用して 4xx になる構成だと、**Verify は通るのに本番が落ちる**ことあり。Webhook ルートは**除外**推奨。
* **チャンネルの取り違え**：Messaging API と Login の **Channel Secret** を混同（最頻出）。

---

## ここまでやったら結果を教えてほしい最小セット

1. `printenv` の結果（LINE系キーだけでOK、値は伏字でも可）
2. `docker compose logs -f api-server` に出た

   * `[IN] ...` 行
   * `VERIFY_FAIL` があればその1〜2行
   * `EVENT follow`/`EVENT message` の行が出たか
3. もし落ちていれば、`follow` ハンドラの先頭 5〜10 行（到達ログだけ分かる程度でOK）

この3点があれば、**「Secretの取り違え」か「raw順序」か「イベント分岐/DBで落ち」か**を即断して、具体的な修正差分（コード／設定）まで落とし込みます。
