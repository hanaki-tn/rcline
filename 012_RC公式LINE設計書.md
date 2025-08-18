
# 基本設計（改訂版）

## 1. 前提（目的・範囲・役割・方針）

### 1.1 目的

* 公式LINEを窓口に、①**お知らせ配信**、②**イベント出欠の依頼・回答・確認**を、**事務局の負担を増やさず**に運用できる仕組みを構築する。
* 会員はLINEだけで完結（LIFF画面で閲覧・回答・確認）。事務局はPCブラウザの管理画面で作業。

### 1.2 範囲（今回リリース）

* **会員の紐付け**：

  * 友だち追加時の**サイレント自動紐付け**（displayName一致）
  * 管理画面での**手動紐付け**
  * 未紐付け者への**セルフ登録（LIFFで名前入力）**
* **audiences（理事会・各委員会…）**のマスタ管理（管理画面からCRUD／メンバー割当）
* **出欠機能**：イベント作成→対象選定→一斉配信→会員回答→状況／履歴閲覧（管理・LIFF双方）
* **リッチメニュー**：

  * 出欠確認（LIFF）
  * お知らせ（Notion公開ページ）
* **Members（Google Sheets）⇄ 業務DB**：**CLIによる手動同期のみ**

### 1.3 役割（運用担当）

* **事務局**

  * OA Managerでの全体連絡（画像配信）
  * Notionお知らせ更新
  * イベント作成・配信、回答状況の確認
  * audiencesメンテ、未紐付け手動対応、Sheets→DB手動同期
* **各委員長**

  * （権限付与＝admin）イベントの作成・配信、回答状況の確認
* **会員**

  * LINEで出欠回答、イベント状況・履歴の閲覧

### 1.4 名前照合・重複

* **displayName照合ルール**：全/半角スペース除去・大小無視の**完全一致**（**漢字**想定）。NFKCは**OFF**（必要時に切替）。
* Members（Google Sheets）に**同姓同名は存在しない**前提。

### 1.5 出欠の記録方式

* **追記型**（`event_responses`に回答のたびに新規追加）。
* “現在値”は**最新行**を採用。履歴はいつでも参照可。

### 1.6 権限

* 管理作業は**adminのみ**。各委員長には**admin権限を付与**（まずはシンプル運用）。
* 管理者アカウントは`admin_users`テーブル（`username`/`password_hash`/`member_id?`）。

### 1.7 時刻（JST方針：保存も表示もJST）

* **保存も表示もJST（Asia/Tokyo, UTC+9）**で統一。
* DB格納は **ISO 8601文字列（例：`2025-08-16T10:00:00+09:00`）** を採用。
* 比較・並び替え・期限判定など、**サーバ内の全ロジックもJST前提**で実装。
* 注意点：

  * SQLiteはタイムゾーン型がないため、**必ずオフセット付き文字列**で保存し、アプリ側でJSTとして扱う。
  * 外部連携（LINEのWebhook等）がUTCを返す場合は**受信時にJSTへ即変換**して保存。
  * 将来UTCへ切替が必要になった場合も、オフセット付き文字列なら**移行が容易**。
* 本件は日本国内運用かつDSTなしのため、**今回の要件ではJST固定が最もシンプル**です。

---

## 2. 運用（ロール別の手順とフロー）

### 2.1 会員登録・紐付け

**目的**：LINEの`userId`とMembers（Google Sheets）を安全・確実に紐付けする。
* ここでの`Members`とは、googleスプレットシートのシート名を指す。

1. **友だち追加（会員）**

   * 会員が公式LINEを友だち追加。
   * サーバはLINEの**displayName**を取得・正規化（空白除去・大小無視、NFKCはOFF）。
   * ログ出力（日時、LINEのdisplayName、LINEのuserId）。displayName、userIdを手動紐づけの参考に使用する。

2. **サイレント自動紐付け（サーバ）**

   * 正規化済みdisplayNameと、DB上の`members.name_key`を**完全一致**で突合。
   * 一致 → `members.line_user_id` に保存（**自動完了・通知なし**）。
   * 不一致 → 次の手動紐付けへ。

3. **手動紐付け**

   * スプレットシートの名簿を手動で紐づけ、更新。
   * それでも紐付けできないケースは、次のセルフ登録へ。

4. **セルフ登録（未紐付け者向けの個別誘導）**

   * 個別メッセージで**登録用LIFFリンク**を送信。
   * LIFFで**氏名（漢字）を1項目入力** → サーバで名簿と完全一致照合 → 一致すれば`line_user_id`保存。
   * 既に紐付け済みの場合は**上書き禁止**（安全側に倒す）。

> **Membersの表示順**：
> Sheets側に**`display_order`（整数）**列を追加。未設定は最後尾扱い。
> 出欠状況表示時は**この順序で名簿を並べる**。

---

### 2.2 全体連絡（事務局：OA Manager運用）

**目的**：これまでのメール／FAXの代替として、LINEで確実に周知する。

* **素材の準備**：

  * 配信資料であるPDF（A4×1枚）を、JPGに変換。（事務局が手動で対応）
  * 画像は**横幅1080px前後**・ファイルサイズは**〜1MB目安**。
  * 変換手順は**別紙運用手順**にまとめる（担当：事務局）。
* **配信方法**：

  * **LINE Official Account Manager**で、全員へ画像を配信。
  * 同じ資料を**Notion「お知らせ」ページ**にも**手動で掲出**（日付降順）。

---

### 2.3 出欠（事務局／各委員長＝admin）

**目的**：対象者だけに出欠回答を公式LINE上で依頼し、会員はLIFFから回答。管理側は状況と履歴を即確認できる。また会員も確認可能とする。

**A. イベント作成〜配信（管理画面／PC）**

1. **イベント基本情報の入力**

   * **タイトル**（必須）、**概要**（ほぼ固定メッセージ。変更可）、**イベント内容のJPG画像**（必須）、**開催日**（必須）、**1行テキストの有無**（必須）。
   * **回答期限**は**今回未使用**（DBカラムは保持、null可）。
2. **対象者の選定**

   * 「全員／理事会／委員会…」を１つ以上チェック → 受信者プレビューに該当会員がチェックONの状態で表示される。
   * 個別に**除外**（チェックOFF）して最終対象を絞り込み。
   * **最終確定リスト**（member_ids）を保存。
3. **送信（Push）**

   * 確定対象へ**1回のPush**で、イベント内容のJPG画像を送信し、続けて出欠回答依頼メッセージを送信。
   * 出欠回答依頼メッセージには**LIFFリンク（イベント詳細）**を添付。

**B. 会員の回答（LIFF）**

1. **メッセージのリンクをタップ** → LINE内ブラウザで**イベント詳細**を表示。

   * 表示：タイトル／本文／**開催日（JST）**。
2. **出席 or 欠席 をタップ** → サーバが`event_responses`へ**追記**。

   * 何度でも回答可能。**最新行が現在値**になる。

**C. 状況・履歴の確認（LIFF）**

* **出欠状況**：イベント詳細内のリンクをタップすると**展開表示**（既定は**折りたたみ**）。

  * **名簿順（`members.display_order`）**で会員一覧を表示し、各行に**出席／欠席／未回答**を表示（現在値ベース）。
* **出欠回答履歴**：出欠状況の最下部に**「出欠回答履歴」**リンク。タップで**履歴を展開**。

  * 表示項目：**回答日時（JST）／会員名／回答内容**。
  * ※履歴リンクは**状況を展開したときのみ表示**（通常は非表示）。

**D. 一覧（LIFF）**

* リッチメニュー「イベント」→ **自分が対象のイベント一覧**。
* 並び：**未回答を上位**、次に**開催日が近い順（JST）**。
* タップで詳細へ遷移（回答・状況・履歴）。

---

### 2.4 audiences（理事会・各委員会）

**目的**：対象選定を素早く・正確に行うためのグルーピングをDBで維持。

* **管理画面でCRUD**：audienceの新規追加／名称変更／削除。
* **所属割当**：会員検索→チェックで所属付与・除外。
* **イベント作成時**はaudience単位で選び、**受信者プレビューで個別除外**して最終確定。

---

### 2.5 お知らせ（会員：Notion）

**目的**：配信済み資料を**遡って一覧**できる置き場を提供。

* notion公開ページの更新は、全て事務局が手動で行う。
* リッチメニュー「お知らせ」→ **Notion公開ページ**へ遷移（LINE内ブラウザ）。
* **日付＋PDF**のセットを**日付降順**で掲載（運用：事務局が手動更新）。

---

## 3. 運用上の補助・例外

* **Sheets→DB同期（Members）**：
  * 同期は、CLIで行う。（CLIのみ）
  * 新規・更新・退会の反映はこの操作で行う。

* **未友だち会員**：
  * Pushは届かないため、**メールや口頭**で**友だち追加→セルフ登録**を案内（運用対応）。

* **紐付け不可時**：
  * displayNameと名簿が一致しない、または本人確認が曖昧な場合は**手動紐付け**までに留める（安全側）。

---

## 4. この方針（JST保存）の妥当性と留意点

* **妥当性**：国内・小規模・DSTなしのため、設計・運用とも**JST固定が最もシンプル**。
* **利点**：タイムゾーン変換を排し、**人間系の解釈ミス**を減らす。LINEの配信文面・画面表示とも整合。
* **留意点**：外部ソース（UTC）の取り込み時は**受信時にJSTへ変換**して保存。将来、UTC保存へ切り替える場合は、オフセット付きISO 8601のため**移行容易**。


# 機能設計（正式版）

## 1) 管理画面（PC）

### 1.1 画面一覧

* **A-LOGIN**：管理者ログイン
* **A-EVENT-NEW**：イベント作成（配信先選択→受信者プレビュー→確定→送信）
* **A-EVENT-DETAIL**：イベント詳細（対象者・出欠サマリ・送信要約・CSV出力）
* **A-AUDIENCE**：audiencesマスタ（CRUD＋所属割当）
* **A-MEMBERS**：会員参照（名簿確認のみ／同期はCLI）

※ダッシュボード／ログ画面は今回無し。
※Members同期は**CLIのみ**（後述）。

---

### 1.2 共通仕様

* 認証：`admin_users`によるログイン必須（Cookieセッション＋CSRF）
* 権限：**admin のみ**
* 表示時刻：**JST（UTC+9）**、`YYYY/MM/DD HH:mm`
* 名簿順：`members.display_order` 昇順（未設定は末尾）
* 検索：初期は無し（将来必要なら追加）

---

### 1.3 A-LOGIN

* 入力：`username`, `password`
* 成功：セッション付与→A-EVENT-NEWへ遷移
* 失敗：エラー表示（連続失敗5回で10分ロック）

---

### 1.4 A-EVENT-NEW（イベント作成）

**目的**：JPG添付（必須）→画像＋リンクを配信を**一度の配信**で実行。
**Stepと項目**：

1. 基本情報

* `title`（必須, 1〜100）
* `held_at`（必須, JST 将来日時）
* `body`（任意, 〜2000）…**定型文をデフォルト**
  例：

  ```
  出欠のご回答をお願いします。
  詳細・回答は以下のリンクからご確認ください。
  ```
* **追加メモ欄の使用**（ON/OFF）

  * ON時：`extra_text_label`（例：備考）
  * `extra_text_attend_only`（ONで「出席時のみ表示」）

2. 添付

* **JPGアップロード（必須, 1枚）**

  * サイズ上限：5MB
  * 受理後、**オリジナルを保存**し、\*\*プレビュー（幅1080px）\*\*を自動生成

3. 配信先選択

* **全員／理事会／各委員会**のチェック（複数可）

4. 受信者プレビュー

* 候補会員を名簿順で一覧表示（**全員チェックON**）
* 個別にチェックOFFで除外
* 確定した `member_ids` を保存

5. 登録＆送信

* ボタン押下で下記処理

  1. `events` 作成（メタ保存）
  2. `event_targets` 作成（確定対象）
  3. **Push送信（messages配列）**

     * `messages[0]`: 画像（プレビューJPGのURL）
     * `messages[1]`: テキスト（`body`＋LIFFリンク）
     * 内部は **multicast優先＋pushフォールバック**
  4. `event_push_stats` を更新（成功/失敗件数）
  5. NDJSONログに詳細を追記

**バリデーション**

* `title`, `held_at` 必須、`held_at` は現在以降（開催が過去はNG）
* 対象 1人以上
* JPGのみ受理、1点まで／サイズ上限（例 5MB）

---

### 1.5 A-EVENT-DETAIL

* 表示：

  * 基本：`title` / `held_at` / `body`
  * **画像**：ページ内に**プレビューJPG**を表示（幅100%）。下に\*\*「全画面で開く」\*\*（**オリジナルJPG**のURL）
    * 対象者：名簿順で現在値（出席／欠席／未回答）※イベントの回答（event_responses）は複数回出来るので、最新の情報を表示する。
  * **送信要約**：`event_push_stats.success_count` / `fail_count` / `last_sent_at`
* 出力：

  * **CSV：最新状態**（member\_id, name, status, extra\_text）
  * **CSV：履歴**（response\_id, responded\_at, member\_id, name, status, extra\_text）
* 再送：今回無し

---

### 1.6 A-AUDIENCE（マスタ管理）

* 一覧＋CRUD：`name`（一意）, `sort_order`
* 所属割当：\*\*全会員リスト（名簿順）\*\*にチェックON/OFF

  * **ONだけ表示**トグル（確認用）
  * **インクリメンタルフィルタ**（入力即時絞り込み）

---

### 1.7 A-MEMBERS（参照のみ）

* 表示：`id, name, display_order, role, line_user_id有無, is_target, line_display_name`
* **同期UI無し**（同期はCLIのみ）

---

## 2) LIFF画面（LINE内）

### 2.1 画面一覧

* **L-LIST**：イベント一覧（自分が対象）
* **L-DETAIL**：イベント詳細（回答／状況／履歴）
* **L-REGISTER**：セルフ登録（未紐付け者）

---

### 2.2 共通

* 認証：LIFFで`userId`→APIへ`x-line-user-id`→`members.line_user_id`突合
* 表示時刻：JST
* 名簿順：`display_order`

---

### 2.3 L-LIST（イベント一覧）

* 並び：**未回答 → 開催日が近い順**
* 各行：タイトル／開催日／自分の出欠回答（未回答／出席／欠席）
* タップ：L-DETAILへ

---

### 2.4 L-DETAIL（イベント詳細）

* 上部：`title`／`held_at`／`body`（短文定型）
* **画像**：ページ内に**プレビューJPG**（タップで**全画面表示**オーバーレイ or 新規タブで**オリジナルJPG**）
* 回答：

  * **［出席］／［欠席］**（何度でも可＝**最新が現在値**）
  * ONのイベントのみ表示。`attend_only=ON`は出席時だけ表示

    * `extra_text_attend_only=ON` のとき、**出席**選択で表示／欠席時は非表示
* 下部：

  * **出欠状況**（折りたたみ）…名簿順に現在値（出席／欠席／未回答）
  * **出欠回答履歴**（折りたたみ、状況展開時のみリンク表示）…`responded_at / name / status / extra_text`

**エラー**

* 招待対象外：403
* 期限超過：今回なし（`deadline_at`はnull運用）

---

### 2.5 L-REGISTER（セルフ登録）

* 入力：`full_name`（漢字 1〜50）
* 完全一致照合（空白除去・大小無視／NFKC無し）→一致したら`line_user_id`保存
* 既紐付けは上書き禁止

---

## 3) API 仕様

## 共通ルール

* **時刻**：JSTのISO8601（例：`2025-09-10T19:00:00+09:00`）
* **認証**：

  * 管理系：Cookieセッション（HttpOnly, Secure）＋ `x-csrf-token`
  * LIFF系：ヘッダ `x-line-user-id: <LINE userId>`
* **権限**：管理系は `admin` のみ
* **エラー**：
  `400 INVALID_INPUT` / `401 UNAUTHENTICATED` / `403 FORBIDDEN` / `404 NOT_FOUND` / `409 CONFLICT` / `500 INTERNAL`

---

## 3.1 管理・認証

### POST /api/admin/login

* **Role**: admin
* **Fields**:

  ```json
  { "username": "string", "password": "string" }
  ```
* **Response**: `200 { "ok": true }`（Cookie/CSRF付与） / `401`
* **処理**:

  1. `admin_users` で照合（bcrypt）
  2. セッション発行、CSRFトークン発行
  3. Cookieに保存、200返却

### POST /api/admin/logout

* **Role**: admin
* **Fields**: なし
* **Response**: `204`
* **処理**: セッション破棄

---

## 3.2 audiences（理事会/委員会）

### GET /api/admin/audiences

* **Role**: admin
* **Response**:

  ```json
  { "items": [ { "id": 1, "name": "理事会", "sort_order": 1 } ] }
  ```
* **処理**: `audiences` を name昇順→sort\_order で返却

### POST /api/admin/audiences

* **Role**: admin
* **Fields**:

  ```json
  { "name": "string", "sort_order": 1 }
  ```
* **Response**: `201 { "id": number }`
* **処理**: `name` 一意性チェック→INSERT

### PATCH /api/admin/audiences/{id}

* **Role**: admin
* **Fields**:

  ```json
  { "name": "string?", "sort_order": 2? }
  ```
* **Response**: `200 { "ok": true }`
* **処理**: 存在確認→更新（重複名チェック）

### DELETE /api/admin/audiences/{id}

* **Role**: admin
* **Response**: `204`
* **処理**: `audience_members` をCASCADEで削除→本体削除

### GET /api/admin/audiences/{id}/members

* **Role**: admin
* **Response**:

  ```json
  { "items": [
      { "member_id": 101, "name": "山田太郎", "display_order": 10,
        "line_user_id_present": true, "is_target": 1 }
  ] }
  ```
* **処理**: 指定audienceの所属会員を `display_order` 順で返す

### PUT /api/admin/audiences/{id}/members

* **Role**: admin
* **Fields**:

  ```json
  { "member_ids": [101, 102, 103] }
  ```
* **Response**: `200 { "count": 3 }`
* **処理**: 指定audienceの所属を**置換**（差分適用）

---

## 3.3 members（参照）

### GET /api/admin/members

* **Role**: admin
* **Query**: `?is_target=1&has_line=1`
* **Response**:

  ```json
  { "items": [
      { "id": 101, "name": "山田太郎", "display_order": 10,
        "line_user_id_present": true, "is_target": 1, "role": "member",
        "line_display_name": "山田太郎" }
  ] }
  ```
* **処理**: `members` を条件つきで返す（検索なし／将来拡張可）

---

## 3.4 受信者プレビュー候補（補助API）

### GET /api/admin/recipients/candidates

* **Role**: admin
* **Query**:

  * `all=1`（全員を候補に含める）
  * `audience_ids=1,2,3`（カンマ区切り）
  * `require_target=1`（`is_target=1` のみ）※デフォルト1
  * `require_line=1`（`line_user_id NOT NULL` のみ）※デフォルト1
* **Response**:

  ```json
  { "items": [
      { "member_id": 101, "name": "山田太郎", "display_order": 10 }
  ] }
  ```
* **処理**: audiencesと全員指定を合成→`is_target`/`line_user_id`でフィルタ→`display_order`順で返却

---

## 3.5 イベント（管理）

### POST /api/admin/events  （multipart/form-data）

* **Role**: admin
* **Fields**:

  * `title` (string, required, 1..100)
  * `held_at` (string, ISO8601+09:00, required, now以降)
  * `body` (string, optional, ≤2000) ※定型文デフォルト
  * `extra_text_enabled` (boolean, default=false)
  * `extra_text_label` (string, default="備考")
  * `extra_text_attend_only` (boolean, default=true)
  * `target_member_ids` (json array<number>, required) …受信者プレビューで確定
  * `image` (file, required, image/jpeg, ≤5MB)
* **Response**:

  ```json
  { "event_id": 123, "targets": 45,
    "push": { "success": 44, "fail": 1 } }
  ```
* **処理**:

  1. 入力検証（時刻・件数・拡張子/サイズ）
  2. `events` INSERT（メタ保存）

     * 画像保存：オリジナルJPG＋プレビューJPG（幅\~1080px）
  3. `event_targets` 一括INSERT（最終member\_ids）
  4. **送信**：`messages=[ Image(preview_url), Text(body+LIFFリンク) ]`

     * 内部は **multicast優先→pushフォールバック**、再試行あり
  5. 成否を集計し `event_push_stats` UPSERT、NDJSONに詳細追記
  6. `201`で返却

### GET /api/admin/events

* **Role**: admin
* **Query**: `?from=2025-09-01&to=2025-09-30&query=理事`
* **Response**:

  ```json
  { "items": [
      { "id":123, "title":"理事会9月",
        "held_at":"2025-09-10T19:00:00+09:00",
        "image_preview_url": "https://.../p.jpg",
        "push_stats": { "success":44, "fail":1, "last_sent_at":"..." } }
  ] }
  ```
* **処理**: 期間/簡易検索で `events` を返却（push\_statsをJOIN）

### GET /api/admin/events/{id}

* **Role**: admin
* **Response**:

  ```json
  {
    "id":123, "title":"理事会9月",
    "held_at":"2025-09-10T19:00:00+09:00",
    "body":"出欠のご回答を…",
    "image_url":"https://.../o.jpg",
    "image_preview_url":"https://.../p.jpg",
    "extra_text": {
      "enabled": true,
      "label": "備考",
      "attend_only": true
    },
    "targets_total": 45,
    "push_stats": { "success": 44, "fail": 1, "last_sent_at": "..." },
    "current_status": [
      { "member_id":101, "name":"山田太郎",
        "status":"attend|absent|pending", "extra_text":"（最新値）" }
    ]
  }
  ```
* **処理**:

  1. `events` + `event_push_stats` を取得
  2. `event_targets` を基底に、各 `member_id` の **最新回答** を `event_responses` から合流
  3. 名簿順（`display_order`）に整列して返却

### GET /api/admin/events/{id}/export/latest.csv

* **Role**: admin
* **Response**: CSV（`member_id,name,status,extra_text`）
* **処理**: 「現在値」をCSV化し返却

### GET /api/admin/events/{id}/export/history.csv

* **Role**: admin
* **Response**: CSV（`response_id,responded_at,member_id,name,status,extra_text`）
* **処理**: `event_responses` の回答履歴を時系列でCSV化

---

## 3.6 LIFF（会員）

### GET /api/liff/events

* **Role**: 会員（LIFF）
* **Headers**: `x-line-user-id`
* **Response**:

  ```json
  { "items": [
      { "id":123, "title":"理事会9月",
        "held_at":"2025-09-10T19:00:00+09:00",
        "my_status":"pending|attend|absent" }
  ] }
  ```
* **処理**: `event_targets` に自分が含まれるイベントのみ返却
  並びは **未回答優先→開催日が近い順**

### GET /api/liff/events/{id}

* **Role**: 会員（LIFF）
* **Headers**: `x-line-user-id`
* **Response**:

  ```json
  {
    "id":123, "title":"理事会9月",
    "held_at":"2025-09-10T19:00:00+09:00",
    "body":"出欠のご回答を…",
    "image_preview_url":"https://.../p.jpg",
    "image_url":"https://.../o.jpg",
    "extra_text": { "enabled": true, "label":"備考", "attend_only": true },
    "my_status":"pending|attend|absent",
    "my_last_extra_text":"（あれば）"
  }
  ```
* **処理**: 対象外なら403。対象ならイベント詳細＋自分の最新回答を返す

### POST /api/liff/events/{id}/respond

* **Role**: 会員（LIFF）
* **Headers**: `x-line-user-id`
* **Fields**:

  ```json
  { "status": "attend" | "absent", "extra_text": "string?" }
  ```
* **Response**:

  ```json
  { "ok": true, "current": "attend|absent" }
  ```
* **処理**:

  1. 対象者か検証（`event_targets`）
  2. 追記型で `event_responses` INSERT（`via='liff'`）

     * `extra_text_enabled=1` のときのみ `extra_text` を保存
     * `attend_only=1` かつ `status='absent'` の場合は `extra_text` を無視
  3. `201`（再回答可能＝最新が現在値）

### GET /api/liff/events/{id}/status

* **Role**: 会員（LIFF）
* **Headers**: `x-line-user-id`
* **Response**:

  ```json
  { "items": [
      { "member_id":101, "name":"山田太郎", "status":"attend|absent|pending" }
  ] }
  ```
* **処理**: 名簿順の「現在値」を返す（一覧の折りたたみ用）

### GET /api/liff/events/{id}/history

* **Role**: 会員（LIFF）
* **Headers**: `x-line-user-id`
* **Response**:

  ```json
  { "items": [
      { "responded_at":"2025-09-01T12:00:00+09:00",
        "member_id":101, "name":"山田太郎",
        "status":"attend|absent", "extra_text":"..." }
  ] }
  ```
* **処理**: `event_responses` の履歴（新しい順）

### POST /api/liff/register

* **Role**: 会員（未紐付け）
* **Headers**: `x-line-user-id`
* **Fields**:

  ```json
  { "full_name": "string(1..50)" }
  ```
* **Response**:

  ```json
  { "ok": true }
  ```

  or `404 { "code":"NO_MATCH" }`
* **処理**:

  1. `members.name_key` と入力名（空白除去・小文字化）で**完全一致**照合
  2. 一致1件→ `line_user_id` を保存（上書き禁止）
  3. 0件 or 複数件→404で安全側

---
## 3.7 LINE Onboarding & Linking（友だち追加時の自動紐付け）

### 3.7.1 モード設計（Feature Flag）

* **ONBOARDING\_MODE**: `"silent"` | `"interactive"`

  * `silent`（初期運用）：**メッセージを返さない**。サイレントで自動紐付けのみ。
  * `interactive`（将来）：**結果に応じてメッセージ返信**（成功時＝ようこそ文、未一致時＝LIFF登録リンク等）。
* **ONBOARDING\_REPLY\_LINK**: `https://liff.line.me/<LIFF_ID>/register`（未一致時に案内するLIFFの登録URL。`interactive`時のみ使用）
* **ONBOARDING\_NAME\_NFKC**: `0|1`（既定=0。将来ONにすると**正規化でNFKC適用**）

> WebhookのURLは**1本のみ**（`/api/line/webhook`）。
> 運用切替は **環境変数の変更だけ** で行います。LINE側設定変更は不要です。

---

### 3.7.2 入口①：LINE Webhook（友だち追加のサイレント/将来インタラクティブ）

**POST** `/api/line/webhook`（公開）

* **Role**：外部（LINE Messaging API）
* **Auth**：`X-Line-Signature`（HMAC-SHA256 with `LINE_CHANNEL_SECRET`）
* **CSRF**：不要
* **Rate Limit**：特に設けない（LINE側の送信頻度に従う）
* **Response**：**常に `200 OK`**（本文 `{ "ok": true }`）
  ※署名不一致時も 200（内部ログに記録）。運用上、常時200を堅持します。

#### Fields（Request Body：例）

```json
{
  "destination": "Uxxxxxxxx",
  "events": [
    {
      "type": "follow",
      "mode": "active",
      "timestamp": 1692252345678,
      "source": { "type": "user", "userId": "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      "replyToken": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  ]
}
```

#### 処理（同期＝HTTP応答まで）

1. 署名検証（失敗でも200返却。内部に `signature_invalid` を記録）
2. `events[]` を走査：`type="follow"`（友だち追加）のみ対象
3. **非同期ジョブ** `link_follow` を enq（payload下記）
4. 即時 `200 { "ok": true }`

> 目標：同期処理は **300ms以内**。DB更新・プロフィール取得・返信は**ジョブ側**で実行。

#### ジョブ：`link_follow`（非同期ワーカー）

* **Payload**

  ```json
  {
    "mode": "silent|interactive",
    "userId": "U....",
    "replyToken": "xxxx",          // 期限切れの可能性あり
    "eventTs": 1692252345678       // idempotency用
  }
  ```

* **ステップ**

  1. **冪等性**：`userId+eventTs` を短期キャッシュで重複排除
  2. **プロフィール取得**：`displayName`（失敗可。ログのみ）
  3. **共通ロジック呼出**：`linkByDisplayName(userId, displayName)`
     → **LinkResult**（下記）を受領
  4. **モード分岐**

     * `silent`：**返信なし**。NDJSONログのみ。
     * `interactive`（将来）：**結果に応じて返信**

       * `replyToken` が生きていれば **Reply API**、失効していれば **Push API** を使用。
  5. **NDJSONログ**：結果を必ず記録（成功/未一致/曖昧/すでに紐付け 等）

* **返信テンプレ（`interactive`時のみ／日本語・最小1通）**

  * LINKED / ALREADY\_LINKED\_SAME

    ```
    友だち追加ありがとうございます。会員情報の確認が完了しました。
    今後、こちらのLINEからお知らせ／出欠のご案内をお送りします。
    ```
  * UNMATCHED

    ```
    友だち追加ありがとうございます。名簿の照合が完了しませんでした。
    お手数ですが、こちらからお名前を登録してください：
    <LIFF登録リンク>
    ```
  * AMBIGUOUS / ALREADY\_LINKED\_OTHER / ERROR

    ```
    友だち追加ありがとうございます。照合に時間がかかっています。
    恐れ入りますが、事務局までご連絡ください。
    ```

---

### 3.7.3 入口②：LIFF 自己登録（既存・同期）

**POST** `/api/liff/register`（既存・再掲）

* **Role**：会員（LIFF）
* **Headers**：`x-line-user-id: <userId>`
* **Fields**

  ```json
  { "full_name": "string(1..50)" }
  ```
* **Response**

  ```json
  { "ok": true }
  ```

  or `404 { "code":"NO_MATCH" }`
* **処理**

  1. `full_name` を **正規化**（下記ルール）
  2. **共通ロジック呼出**：`linkByFullName(userId, full_name)`
  3. **結果別**

     * `LINKED | ALREADY_LINKED_SAME` → `200 { ok: true }`
     * `UNMATCHED | AMBIGUOUS | ALREADY_LINKED_OTHER` → `404 NO_MATCH`（安全側）
  4. NDJSONログ（kind=`register`）に記録

---

### 3.7.4 内部ロジック：Linker Service（共通）

UIや入口に依存しない**紐付け処理の単一実装**。
Webhook（follow）・LIFF（register）から**同一の関数**を呼び出す。

#### 関数シグネチャ

```ts
type LinkResultType =
  | "LINKED"
  | "ALREADY_LINKED_SAME"
  | "ALREADY_LINKED_OTHER"
  | "UNMATCHED"
  | "AMBIGUOUS"
  | "ERROR";

type LinkResult = {
  type: LinkResultType;
  memberId?: number;
  normalizedName?: string;
  reason?: string;       // エラーや競合理由
};

async function linkByDisplayName(userId: string, displayName: string | null): Promise<LinkResult>;
async function linkByFullName(userId: string, inputName: string): Promise<LinkResult>;
```

#### 正規化（name\_key生成）

* 入力：氏名（displayName / full\_name）
* 手順（既定）

  1. **全ての空白（全角/半角/連続）を削除**
  2. **英字は小文字化**
  3. **NFKCは適用しない**（`ONBOARDING_NAME_NFKC=1` でON可）
* 例：`"山田  太郎"` → `"山田太郎"`

#### 照合・更新フロー（擬似コード）

```sql
-- 1) 候補探索
SELECT id, line_user_id
FROM members
WHERE name_key = :normalized
LIMIT 2;               -- >1件なら AMBIGUOUS

-- 2) 分岐
-- 0件：UNMATCHED
-- 2件以上：AMBIGUOUS
-- 1件：以下へ
```

```sql
-- 3) 紐付け（line_user_id が空の場合のみ）
-- 競合対策：WHERE で line_user_id IS NULL を明示
UPDATE members
   SET line_user_id = :userId,
       line_display_name = :displayName,    -- displayName があれば
       is_target = 1,
       updated_at = :now
 WHERE id = :memberId
   AND (line_user_id IS NULL);
-- 影響行数 = 1 → LINKED
-- 影響行数 = 0 → 既に埋まっている
```

* 既に埋まっている場合の判定

  * `SELECT line_user_id FROM members WHERE id=:memberId` →

    * それが **同一 userId** → `ALREADY_LINKED_SAME`（`line_display_name` は別途 UPDATE 可）
    * **異なる userId** → `ALREADY_LINKED_OTHER`（安全側で何もしない）

* 例外（DB/IO失敗） → `ERROR`

#### トランザクション／一意制約

* `members.line_user_id` は **UNIQUE**。
* UPDATE 時の `WHERE line_user_id IS NULL` で**競合回避**。
* 競合例（同時リンク）：DB側の一意制約エラーを捕捉 → 再読込で `ALREADY_LINKED_OTHER` と判断。

#### 更新カラム

* `line_user_id`: 空→設定（UNIQUE）
* `line_display_name`: **都度最新**に更新してOK
* `is_target`: **1**（紐付け成功時）
* `updated_at`: 更新

---

### 3.7.5 ロギング（NDJSON）

* **ファイル**

  * Webhook：`/var/app/logs/line/WEBHOOK-YYYY-MM-DD.ndjson`
  * Register：`/var/app/logs/line/REGISTER-YYYY-MM-DD.ndjson`
* **共通レコード例**

```json
{"ts":"2025-08-17T09:00:01+09:00","kind":"follow","mode":"silent","userId":"Uxxx","displayName":"山田太郎","normalized":"山田太郎","result":"LINKED","member_id":101}
{"ts":"2025-08-17T09:00:02+09:00","kind":"follow","mode":"silent","userId":"Uyyy","displayName":"山田太郎","normalized":"山田太郎","result":"UNMATCHED"}
{"ts":"2025-08-17T09:00:03+09:00","kind":"register","userId":"Uzzz","inputName":"山田太郎","normalized":"山田太郎","result":"ALREADY_LINKED_SAME","member_id":101}
{"ts":"2025-08-17T09:00:04+09:00","kind":"follow","mode":"interactive","userId":"Uwww","displayName":"山田太郎","normalized":"山田太郎","result":"UNMATCHED","reply":"sent","reply_link":"https://liff.line.me/.../register"}
```

* **署名不一致**や**プロフィール取得失敗**は `reason` を付与して記録。

---

### 3.7.6 セキュリティ・リトライ・冪等性

* **署名検証**：`X-Line-Signature` を必ず検証（不一致でも 200 返却・内部記録）
* **リプレイ対策**：Webhookの `timestamp` が**24h超**は破棄
* **冪等性**：`userId+eventTs` を短期キャッシュで抑止（数分）
* **リトライ**：LINE Profile/DB失敗時は指数バックオフで数回。最終失敗は `ERROR` ログのみ（HTTP応答は済）

---

### 3.7.7 仕様サマリ（要点）

* **Webhookは常に200（サイレント）**。処理は**非同期**。
* **入口は1本／モードで切替**（silent→interactive）
* **紐付けロジックは Linker Service に集約**（`linkByDisplayName`／`linkByFullName`）
* **一致1件のみ紐付け**、`is_target=1`、`line_display_name`更新
* **未一致/曖昧/競合**は**何もしない**（ログのみ）
* **将来**インタラクティブに切替時は **結果に応じて返信**（未一致のみ登録リンク）

---

## 3.8 エラーフォーマット（共通例）

```json
{ "code": "INVALID_INPUT",
  "message": "held_at must be in the future",
  "details": [{ "field": "held_at", "reason": "PAST_DATE" }] }
```

---

## 4) DB 設計（SQLite）

> 文字列日時は\*\*JSTのISO8601（+09:00）\*\*で保存。
> 外部キーON、必要なインデックス付与。

### members

* 用途：Google Sheets（名簿）の**ミラー**。LINEアカウントとの紐付けや配信対象判定の基礎。アプリ側で直接編集せず、\*\*同期（CLI）\*\*で更新する想定。
* 時刻：`created_at`/`updated_at` は **JST ISO8601（+09:00）**。
* カラム説明：

  * `id`：会員ID。**SheetsのIDと一致**させる（移行時に合わせる）。PK。
  * `name`：会員の表示名（漢字）。画面表示・CSV出力に使用。
  * `name_key`：名寄せ用の正規化キー。**空白全除去＋英字は小文字化**。NFKCは**適用しない**。displayName照合やセルフ登録で使用。`idx_members_name_key`。
  * `display_order`：名簿の**表示順**。出欠状況一覧の並びに使用。未設定NULLは末尾扱い。`idx_members_display_order`。
  * `line_user_id`：LINEのuserId。**ユニーク**。サイレント自動紐付け／セルフ登録／手動同期で設定。
  * `line_display_name`：最後に取得したLINE表示名（参考情報）。本人以外が操作した可能性の監査などに有用。運用で**都度更新**してよい。
  * `is_target`：配信対象フラグ（0/1）。**1＝配信候補**。初期0、`line_user_id`登録時に1へ自動切替（運用でOFF可）。`idx_members_is_target`。
  * `role`：`'member' | 'admin'`。各委員長に`admin`を付与する方針。
* 配信対象の基本式：`audience_members ∪ 全員指定` → **`is_target=1` ∩ `line_user_id NOT NULL`**。
* 注意：**同姓同名は存在しない前提**。名寄せは `name_key` で完全一致のみ。

---

### admin_users

* 用途：管理画面ログイン用アカウント。会員（members）とは**分離**して管理。
* カラム説明：

  * `id`：PK。
  * `username`：ログインID。**ユニーク**。
  * `password_hash`：**bcrypt**等でハッシュ化した値。生パスワードは保持しない。
  * `member_id`：任意。対応する会員がいる場合のみ設定。外部キー（削除時はNULL）。
  * `created_at` / `updated_at`：JST ISO8601。
* 運用：初期は環境変数から**種アカウント**を投入。ロックアウトやCSRF等はアプリ層で制御。

---

### audiences

* 用途：**理事会／各委員会**などのグループ定義。対象選定の基点。
* カラム説明：

  * `id`：PK。
  * `name`：グループ名。**ユニーク**。
  * `sort_order`：画面上の並び順。NULL可。
  * `created_at` / `updated_at`：JST ISO8601。
* 備考：削除時は関連する `audience_members` が**連鎖削除**（CASCADE）。

---

### audience_members

* 用途：会員とオーディエンスの**中間テーブル**。対象算出の前段。
* カラム説明：

  * `audience_id`：`audiences.id` へのFK。
  * `member_id`：`members.id` へのFK。
  * **複合PK**：`(audience_id, member_id)`。重複割当を防止。
* インデックス：`idx_audmem_member` により会員から所属を引きやすくする。
* 画面運用：**全会員リスト（名簿順）に対するON/OFF**で更新。PUTは**最終リストで上書き**（idempotent）。

---

### events

* 用途：イベント（出欠取得の単位）の**メタ情報**と配信用アセット（JPG）。
* カラム説明：

  * `id`：PK。
  * `title`：イベントタイトル。
  * `body`：LIFF詳細上部に表示する短文（定型文ベース）。
  * `held_at`：開催日時（JST ISO8601）。**過去日時は作成不可**。
  * `deadline_at`：回答期限。今回は**NULL運用**（将来拡張のため残置）。
  * `image_url`：**オリジナルJPG**の公開URL（高解像度・全画面用）。
  * `image_size`：バイト数（任意）。
  * `image_preview_url`：**プレビューJPG**の公開URL（幅\~1080px）。メッセージとLIFF本文で主に使用。
  * `image_preview_size`：バイト数（任意）。
  * `extra_text_enabled`：追加メモ欄の有無（0/1）。
  * `extra_text_label`：メモ欄ラベル（例：備考）。
  * `extra_text_attend_only`：**出席時のみ**メモ欄を表示するか（0/1）。
  * `created_by_admin`：作成者（`admin_users.id`）。
  * `created_at` / `updated_at`：JST ISO8601。
* インデックス：`idx_events_held_at` で開催日順の一覧を高速化。
* ファイル運用：`image_url` は**公開https**・推測困難なパス。プレビューは自動生成。原本の保管期間はポリシーに従う。

---

### event_targets

* 用途：当該イベントの**最終送信対象者の確定リスト**。受信者プレビューで確定した **member_ids のスナップショット**。
* カラム説明：

  * `event_id`：`events.id` へのFK。
  * `member_id`：`members.id` へのFK。
  * **複合PK**：`(event_id, member_id)`。同一イベントへの重複登録を防止。
* インデックス：`idx_evt_targets_member` により、会員→対象イベントの探索を高速化。
* 備考：**invited_at / invited_by は保持しない**（配信時刻・発信者は `events` とログで管理）。削除はイベント削除に連鎖。

---

### event_responses

* 用途：**出欠回答の履歴（追記型）**。会員(member_id)毎の最新行が**現在値**となる。
* カラム説明：

  * `id`：PK（履歴行ID）。
  * `event_id`：対象イベント（FK）。
  * `member_id`：回答者（FK）。
  * `status`：`'attend' | 'absent'`。ボタン押下に対応。
  * `extra_text`：追加メモ（今回1項目）。`extra_text_enabled=1` のイベントのみ有効。`attend_only=1` の場合、欠席時は**無視**。
  * `via`：`'liff' | 'admin'`。通常は`'liff'`。管理者代行入力があれば `'admin'`。
  * `responded_at`：回答日時（JST ISO8601）。最新＝現在値として扱う。
* インデックス：`idx_evtrsp_event_member_time`（`responded_at DESC`）で**最新行の取得**を高速化。
* 注意：**更新でなく追記**。誤回答の訂正は「新しい行を追加」して上書き効果を得る。

---

### event_push_stats

* 用途：**イベント単位の配信結果サマリ**。画面表示の即時計算用（要約）。**詳細はNDJSON**で保持。
* カラム説明：

  * `event_id`：`events.id`（PK＝1:1）。
  * `success_count`：LINE APIが最終的に**受理**した件数（再試行後の確定値）。
  * `fail_count`：再試行しても**受理不可**だった件数（友だち未完了・無効ID・恒久4xx等）。
  * `last_sent_at`：直近の送信完了時刻（JST ISO8601）。
* 用途詳細：A-EVENT-DETAILに「配信 48/50（失敗2）」のように表示。イベント一覧でのフィルタや強調にも利用可。
* 注意：**正本はNDJSON**。個別誰が失敗したかの突合はログ側で確認する。

---


```sql
-- 会員（名簿ミラー）
CREATE TABLE members (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  name_key         TEXT NOT NULL,               -- 空白除去＋小文字化（NFKC無し）
  display_order    INTEGER,
  line_user_id     TEXT UNIQUE,
  line_display_name TEXT,                       -- 参考用：最後に見えた表示名
  is_target        INTEGER NOT NULL DEFAULT 0,  -- 0/1：配信対象に含めるか
  role             TEXT NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_members_name_key ON members(name_key);
CREATE INDEX idx_members_display_order ON members(display_order);
CREATE INDEX idx_members_is_target ON members(is_target);

-- 管理ユーザー
CREATE TABLE admin_users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  member_id        INTEGER,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- グループ（理事会・各委員会）
CREATE TABLE audiences (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE,
  sort_order       INTEGER,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- グループ所属
CREATE TABLE audience_members (
  audience_id      INTEGER NOT NULL,
  member_id        INTEGER NOT NULL,
  PRIMARY KEY (audience_id, member_id),
  FOREIGN KEY(audience_id) REFERENCES audiences(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(member_id)   REFERENCES members(id)   ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_audmem_member ON audience_members(member_id);

-- イベント
CREATE TABLE events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  body             TEXT,
  held_at          TEXT NOT NULL,           -- JST ISO8601
  deadline_at      TEXT,                    -- NULL（今回未使用）
  -- 添付（JPG）
  image_url        TEXT,                          -- オリジナルJPGの公開URL
  image_size       INTEGER,                       -- バイト
  image_preview_url TEXT,                         -- プレビューJPG（幅~1080px）
  image_preview_size INTEGER,
  -- 追加メモ欄
  extra_text_enabled      INTEGER NOT NULL DEFAULT 0,  -- 0/1
  extra_text_label        TEXT DEFAULT '備考',
  extra_text_attend_only  INTEGER NOT NULL DEFAULT 1,  -- 0/1
  created_by_admin INTEGER NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY(created_by_admin) REFERENCES admin_users(id) ON UPDATE CASCADE
);
CREATE INDEX idx_events_held_at ON events(held_at);

-- イベント対象者
CREATE TABLE event_targets (
  event_id         INTEGER NOT NULL,
  member_id        INTEGER NOT NULL,
  PRIMARY KEY (event_id, member_id),
  FOREIGN KEY(event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_evt_targets_member ON event_targets(member_id);

-- 出欠回答（追記型の履歴）
CREATE TABLE event_responses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL,
  member_id        INTEGER NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('attend','absent')),
  extra_text       TEXT,                     -- 追加メモ（今回1項目のみ）
  via              TEXT NOT NULL CHECK (via IN ('liff','admin')),
  responded_at     TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX idx_evtrsp_event_member_time ON event_responses(event_id, member_id, responded_at DESC);

-- 送信要約（イベント単位）
CREATE TABLE event_push_stats (
  event_id         INTEGER PRIMARY KEY,
  success_count    INTEGER NOT NULL DEFAULT 0,
  fail_count       INTEGER NOT NULL DEFAULT 0,
  last_sent_at     TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id) ON UPDATE CASCADE ON DELETE CASCADE
);
```

**送信対象の算出（概念）**
`(audience_members ∪ 全員指定) ∩ is_target=1 ∩ line_user_id NOT NULL` を基底集合とし、受信者プレビューで除外した結果が `event_targets`。

**最新状態クエリ（例）**

```sql
SELECT et.member_id,
       COALESCE((
         SELECT er.status
         FROM event_responses er
         WHERE er.event_id = et.event_id AND er.member_id = et.member_id
         ORDER BY er.responded_at DESC
         LIMIT 1
       ), 'pending') AS current_status,
       (
         SELECT er.extra_text
         FROM event_responses er
         WHERE er.event_id = et.event_id AND er.member_id = et.member_id
         ORDER BY er.responded_at DESC
         LIMIT 1
       ) AS current_extra
FROM event_targets et
WHERE et.event_id = :event_id
ORDER BY (SELECT display_order FROM members m WHERE m.id = et.member_id) ASC NULLS LAST;
```

---

## 5) ファイル／ログ運用

### 5.1 ファイル保存
#### 5.1.1 イベント作成でのJPGファイル
  * オリジナル：`/files/events/{eventId}/notice_o.jpg`
  * プレビュー：`/files/events/{eventId}/notice_p.jpg`
  * いずれも**UUIDで推測困難化**で実装可（上は例）
* 公開：**httpsで公開**（画像メッセージ＆LIFF表示のため）
* 保管期間：**無期限**
* セキュリティ：URL秘匿性＋アクセスログ（必要に応じて）

### 5.2 Push詳細ログ（NDJSON）

* パス：`/var/app/logs/push/YYYY-MM-DD.ndjson`
* 1行例：

  ```json
  {"ts":"2025-08-16T12:34:56+09:00","kind":"event","event_id":123,"member_id":456,"status":"success","message_id":"xxx"}
  ```
* 参照：**CLIで取得**（list/pull）。画面UIは無し。
* 画面は `event_push_stats` のみ使用（A-EVENT-DETAILで要約表示）。

---

## 6) 送信ロジック（内部）

* 受け取った`line_user_id[]`を**チャンク分割**し、
  **multicast優先**→失敗分は**push再試行**（指数バックオフ）。
* メッセージは**配列**で一度に送る：
  `messages = [ ImageMessage(JPG), TextMessage(body + LIFFリンク) ]`
* 成功／失敗を集計し `event_push_stats` 反映、**詳細はNDJSON**へ。

---

## 7) バリデーション（抜粋）

* **イベント作成**

  * `title` 必須（1〜100）
  * `held_at` 必須（JST、現在以降）
  * `target_member_ids` 必須（1件以上、全員存在）
  * `image` が **必須**（jpg/jpeg）、サイズ上限5MB
* **回答（LIFF）**

  * `status` ∈ {attend, absent}
  * `extra_text` は `extra_text_enabled=1` の時のみ受理
  * `extra_text_attend_only=1` かつ `status='absent'` の場合は無視

---

## 8) 想定オペとCSV

* **A-EVENT-NEW**で登録→送信
* 会員は**公式LINEの画像**をまず見て、次メッセージの**リンクから回答**
* **A-EVENT-DETAIL**でサマリ確認・CSV出力

  * 最新CSV：`member_id, name, status, extra_text`
  * 履歴CSV：`response_id, responded_at, member_id, name, status, extra_text`

---

## 9) 非対象・例外

* **From表記**：**無し**（当面は事務局のみ利用）
* **個別メッセージ送信機能**：**無し**（将来需要があれば再検討）
* **回答期限**：DBには保持できるが、今回UI非表示・判定無し（null）


