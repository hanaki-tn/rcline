# 公式LINE × 出欠管理システム — 設計まとめ（v0.4 更新版 + 運用概要 / 2025-08-09）

## 0. 目的・前提

* 目的：**公式LINE内で完結**する「会員登録」と「出欠管理」により、事務局業務を効率化。
* 規模：会員 ≈ 40 名（将来最大 50 名程度）。
* コスト：**無料枠厳守**（イベント依頼の Push は **1回のみ**／**リマインド無し**）。
* プラットフォーム：

  * 会員登録：**n8n + Google Sheets (Members)**
  * 出欠管理：**Node/Express + SQLite**（将来 **Postgres** 移行容易な設計）
  * 画面：**LIFF**（一覧/詳細＝共通、作成＝Admin専用）
  * 事務局PC：**LINE デスクトップ**から LIFF を起動
* Notion：公式発信のアーカイブ先。リッチメニューから遷移（投稿は当面手動）

---

## 運用概要

### ① 会員登録

* 会員が**公式LINEを友だち追加**。
* LINEの表示名を正規化して、シート`Members`の、カラム`name_key` と突合。

  * 一致 → `line_user_id` を紐付け、シートを更新することで自動登録完了。
  * 不一致 → 登録用LIFFリンクを返信。LIFFで氏名入力→n8n経由で突合→一致で紐付け。

### ② イベント作成

* `members.role='admin'` の会員が作成可。
* 公式LINEで「イベント作成」と入力 → 作成LIFFリンクを返信。
* タイトル／本文／開催日／期限／配信先を入力→受信者プレビューで個別除外→確定→送信先にPush（1回）。

### ③ 出欠回答

* 会員はPushメッセージ内のリンクからイベント詳細を開く。
* 出席/欠席ボタンを押すと回答が記録され、LINEに「出席で回答しました」等を返信。
* 回答は締切前なら何度でも変更可（履歴は全て保持）。

### ④ イベント一覧

* LIFFメニューからアクセス。
* 自分が対象または自分が作成したイベントを一覧表示。
* イベント名クリックで詳細画面へ。

### ⑤ イベント詳細

* タイトル／本文／開催日／期限／全員の最新出欠状況を表示。
* 締切前かつ招待されている場合のみ出欠ボタン表示。
* ページ下部に「回答履歴」リンク（全履歴表示）。

---

## 1. スコープ

1. **会員登録**（表示名の自動突合＋未一致時の自己申告 LIFF）
2. **出欠管理**（イベント作成→配信→回答→一覧/詳細/履歴）
3. **対象メンテ（audiences）**：少数のシンプル分類で配信先を素早く指定（※APIへは最終確定リストのみ送る）

---

## 2. 関係者・権限

* `member`：自分が対象のイベントを一覧/詳細で閲覧、**回答・再回答（締切前）**。
* `admin`：イベント作成、配信先選択、**自分が作成**したイベントの一覧/詳細閲覧。
* 権限付与：**一度だけ**管理用 LIFF にアクセス → サーバが `line_user_id` を取得し `role='admin'` を付与（パスワード無し）。

**履歴表示の権限**：**受信者 & 作成者は閲覧可**（既定）。

---

## 3. ユーザー体験（UX）

### 3.1 会員登録（n8n）

* follow 時：displayName を正規化し `Members.name_key` と照合。

  * 一致 → `line_user_id` 紐付け → **Reply API**で"登録完了"。
  * 不一致 → **登録用 LIFF** の URL を Reply。
* 登録 LIFF：会員が“名前”入力→n8n Webhook→照合→一致で紐付け→`liff.sendMessages` で完了通知（無料）。

**正規化ルール（name → name\_key）**

* 全/半角空白の**全削除**（タブ含む）。
* **NFKC** 正規化。
* 英字は **lowercase**。漢字かな変換は行わない（将来拡張可）。

### 3.2 出欠（LIFF）

* **イベント一覧（共通1画面）**：

  * 抽出：**自分が対象 ∪ 自分が作成**（重複排除）
  * 並び：**未回答優先** → 期限が近い順 → 開催日 → 作成日時降順
  * 表示：タイトル／開催日（held\_at）／期限（deadline\_at）／**自分の回答バッジ**（未・出席・欠席）／**タグ**（対象 / 作成者）
* **イベント詳細**：

  * 表示：タイトル／本文／開催日／期限／**全員の最新ステータス一覧**（このイベントに限る）
  * **出席/欠席ボタン**表示条件：

    1. 現在が**締切前**、かつ
    2. 自分に **招待（pending 初期行）が存在**
  * 下部に **「回答履歴を表示」** リンク（同ページ折りたたみ or 別ページ）。
* **イベント作成（Admin LIFF）**：

  * 入力：タイトル／本文／**開催日**／**回答期限**／配信先
  * 配信先 UI：

    1. **ベース選択**（`全員` or **audiences複数**）
    2. **受信者プレビュー**（展開結果を表示し、**個別除外**のみ可能）
    3. 確定→作成→**Push 1回送信**（LIFFリンク付き）
  * **重要**：APIには **“最終確定メンバー（member\_ids）だけ”** を送信（= クライアント最終確定方式）。

---

## 4. データモデル（SQLite / Postgres 互換）

* すべてのIDは **ULID/UUID（TEXT）**、日時は **UTC ISO8601（TEXT）**。

```sql
-- members
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name_raw TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  name_display TEXT,
  line_user_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_members_line_user_id ON members(line_user_id);

-- audiences（分類）
CREATE TABLE audiences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- audience_members（多対多）
CREATE TABLE audience_members (
  audience_id TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  PRIMARY KEY (audience_id, member_id)
);

-- events
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  held_at TEXT NOT NULL,            -- 開催日
  deadline_at TEXT NOT NULL,        -- 回答期限
  created_by TEXT NOT NULL,         -- members.id（admin想定）
  created_at TEXT NOT NULL
);

-- event_responses（追記型ログ＝招待＋以後の回答変更をすべて保持）
CREATE TABLE event_responses (
  id TEXT PRIMARY KEY,                  -- ulid/uuid
  event_id  TEXT NOT NULL,
  member_id TEXT NOT NULL,
  status    TEXT NOT NULL CHECK(status IN ('pending','attend','absent')),
  via       TEXT NOT NULL CHECK(via IN ('system','member','admin')) DEFAULT 'member',
  created_at TEXT NOT NULL              -- 追加時刻（UTC ISO8601）
);
CREATE INDEX idx_evresp_event ON event_responses(event_id);
CREATE INDEX idx_evresp_event_member_time ON event_responses(event_id, member_id, created_at);
```

**ポイント**

* イベント作成時：APIが受け取った **最終確定 `member_ids`**（または全員）に対して、会員ごとに **`pending` を一括 INSERT**（`via='system'`）。
* 回答・変更：**更新せず** `attend/absent` を **追記 INSERT**（`via='member'`）。
* 最新状態：同一 `(event_id, member_id)` の **`created_at` 最大**行を採用。

**初期 audiences（分類）**

* 全会員（予約語）／理事会／管理運営委員会／社会奉仕委員会
  （※APIには送らず、フロント側で member\_ids に展開するための運用データ）

---

## 5. API 仕様（v1）

### 5.1 認証・認可

* LIFF → API へ `x-line-user-id` を送信し、`members.line_user_id` と突合して本人認可。
* `role='admin'` のみイベント作成可。
* イベント詳細/履歴は **受信者 or 作成者**のみ 200（それ以外は 403）。

### 5.2 エンドポイント

#### GET `/api/events`

* 説明：**自分が対象 ∪ 自分が作成**の一覧（既定）。
* クエリ（任意）：`scope=self|created|all`（既定=all）、`q`、`from`、`to`（将来用）。
* レスポンス例：

```json
[
  {
    "id": "01J...AB",
    "title": "例会出欠確認",
    "held_at": "2025-09-05T00:00:00Z",
    "deadline_at": "2025-09-02T15:00:00Z",
    "my_status": "pending",
    "tags": ["対象"]
  }
]
```

#### GET `/api/events/:id`

* 条件：受信者 or 作成者のみ。
* 返却：`title, message, held_at, deadline_at, my_status, responses[], counts{attend,absent,pending}`
* `responses[]` は **全員の“最新”ステータス**。
* 取得用 SQL（例：SQLite）

```sql
SELECT er.event_id, er.member_id, er.status, er.created_at
FROM event_responses er
JOIN (
  SELECT member_id, MAX(created_at) AS max_created
  FROM event_responses
  WHERE event_id = :event_id
  GROUP BY member_id
) last ON er.member_id = last.member_id AND er.created_at = last.max_created
WHERE er.event_id = :event_id
ORDER BY (er.status = 'pending') DESC, er.created_at DESC;
```

#### GET `/api/events/:id/history`

* 説明：**回答履歴ログ**（追記分すべて）。`?member_id=` で個人抽出可。
* 返却例：

```json
[
  {"member_id":"01H..","name":"山田太郎","status":"attend","via":"member","created_at":"2025-09-02T03:00:12Z"},
  {"member_id":"01H..","name":"山田太郎","status":"pending","via":"system","created_at":"2025-08-31T01:00:00Z"}
]
```

#### POST `/api/events`（Admin）

* body（**クライアント最終確定方式**）

```json
{
  "title": "例会出欠確認",
  "message": "本文（自由入力）",
  "held_at": "2025-09-05T00:00:00Z",
  "deadline_at": "2025-09-02T15:00:00Z",
  "targets": {
    "all": false,
    "member_ids": ["mem-0001","mem-0007","mem-0032"]
  }
}
```

* ルール：

  * `all === true` の場合、**全会員**を招待（`member_ids` は空 or 無視）。
  * `all === false` の場合、`member_ids` は **1人以上必須**。
  * `member_ids` はサーバ側で **存在チェック**・**重複除去**。
  * 最終人数が 0 人なら **400**。
* 振る舞い：

  1. `events` を INSERT
  2. **最終 `member_ids`**（or 全員）に対し `event_responses` へ **`pending` 一括 INSERT**（`via='system'`）
  3. **Push を 1回送信**（LIFFリンク付き）
* 201 レスポンス：`{"id":"01J...AB","recipients":37}`

#### POST `/api/events/:id/respond`

* body：`{"status":"attend"}` or `{"status":"absent"}`
* ルール：

  * 締切前のみ許可（締切後は **409**）
  * 招待対象（当該 `(event_id, member_id)` の**pending 初期行が存在**）でない場合 **403**
  * **INSERT 1行**（`status` を追記、`via='member'`）
* 200 レスポンス：`{"ok":true,"status":"attend"}`

#### （任意）POST `/api/admin/grant-self`

* 管理用 LIFF から叩き、アクセス中の `line_user_id` を `role='admin'` に昇格。
* 一度きりの**署名付きURL**で実行（内部トークンでワンタイム保護）。

---

## 6. メッセージ送信

* **登録系**：Reply API / `liff.sendMessages`（無料）。
* **イベント依頼**：Push **1回のみ**（無料枠内で運用／残通数ガードは**実装しない**）。
* 文面テンプレ（例）

  * `【${title}】
    開催日:${heldJst}
    回答期限:${deadlineJst}
    ↓ここから回答
    ${liffUrl}`

---

## 7. 非機能・運用

* ログ：APIアクセス／イベント作成／Push結果／回答 INSERT（`event_id`/`member_id`/`status`/`via`/`created_at`）。
* タイムゾーン：DBは **UTC**、表示は **JST**。締切判定はサーバ側で UTC → JST を考慮して実施。
* 競合：50名規模で問題なし。多重送信は **重複行**として履歴に残るが最新決定ロジックで吸収。
* 移行性：TEXT/ISO8601/ULID で方言依存を低減。Postgres移行時は `TIMESTAMPTZ` や生成列への移行を検討可能。

---

## 8. 実装順（推奨）

1. **DB マイグレーション**（上記スキーマ）
2. **API**（`/events{list,detail,history,create,respond}` + 認可）
3. **Member LIFF**（一覧→詳細→回答、履歴折りたたみ）
4. **Admin LIFF**（作成／配信先選択：ベース→プレビュー→個別除外→**member\_ids 確定送信**）
5. **n8n 登録フロー**の結合（正規化ロジック共通化）
6. **audiences 初期データ**投入と簡易メンテUI（※API非依存）

---

## 9. 開発メモ（Claude Code 向け）

* ENV

  * `LINE_CHANNEL_ACCESS_TOKEN`
  * `LIFF_ID_MEMBER`, `LIFF_ID_ADMIN`
  * `BASE_URL`
* バリデーション

  * 開催日・締切：ISO8601、`deadline_at < held_at`、未来日チェック
  * タイトル/本文：非空、本文上限（例 1000 文字）
* UI ヒント

  * 一覧：タグ（対象/作成者）・回答バッジ（未/出席/欠席）・期限 D- 表示
  * 作成：受信者プレビューで**人数合計**を常時表示（例：全員40 → 除外3 → **最終37名**）

---

## 10. 変更履歴

* **v0.4 更新（2025-08-09）**

  * `event_recipients` を廃止し、**`event_responses` を追記型ログ**として統合。
  * 履歴 API `GET /api/events/:id/history` を新設（受信者 & 作成者のみ）。
  * イベント詳細に「回答履歴を表示」リンクを追加。
  * Push 残通数ガードは実装しない（運用でカバー）。
  * 一覧は **自分が対象 ∪ 自分が作成** を統合表示に確定。
  * **APIの targets を簡略化（`all` / `member_ids` のみ）**。フロントで分類→プレビュー→除外まで行い、**最終確定リストだけ送信**。
