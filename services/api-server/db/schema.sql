-- RC LINE API Schema
-- 時刻は全てJST ISO8601（+09:00）で保存

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
  updated_at       TEXT NOT NULL,
  del_flg          INTEGER NOT NULL DEFAULT 0,
  deleted_at       TEXT
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

-- audiencesテーブルのインデックス
CREATE INDEX IF NOT EXISTS idx_audiences_active ON audiences(id, sort_order, del_flg);

-- イベント
CREATE TABLE events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  body             TEXT,
  held_at          TEXT NOT NULL,           -- JST ISO8601
  deadline_at      TEXT,                    -- JST ISO8601
  -- 添付（JPG）
  image_url        TEXT,                          -- オリジナルJPGの公開URL
  image_size       INTEGER,                       -- バイト
  image_preview_url TEXT,                         -- プレビューJPG（幅~1080px）
  image_preview_size INTEGER,
  -- 追加メモ欄
  extra_text_enabled      INTEGER NOT NULL DEFAULT 0,  -- 0/1
  extra_text_label        TEXT DEFAULT '備考',
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

-- 追加インデックス（パフォーマンス最適化）
CREATE INDEX idx_event_targets_lookup ON event_targets(event_id, member_id);
CREATE INDEX idx_event_responses_latest ON event_responses(event_id, member_id, responded_at DESC);
CREATE INDEX idx_members_display ON members(display_order, name);

-- メッセージ送信ログ
CREATE TABLE message_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('text', 'image')),
  message_text TEXT,                    -- テキストメッセージ内容
  image_url TEXT,                       -- 画像URL（オリジナル）
  image_preview_url TEXT,               -- プレビュー画像URL
  image_size INTEGER,                   -- 画像ファイルサイズ
  image_preview_size INTEGER,           -- プレビュー画像ファイルサイズ
  audience_id INTEGER,                  -- 送信先audience
  recipient_count INTEGER NOT NULL,     -- 送信対象者数
  sent_by_admin INTEGER NOT NULL,       -- 送信者
  sent_at TEXT NOT NULL,                -- 送信日時（JST ISO8601）
  success_count INTEGER DEFAULT 0,      -- 送信成功数
  fail_count INTEGER DEFAULT 0,         -- 送信失敗数
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(audience_id) REFERENCES audiences(id) ON UPDATE CASCADE,
  FOREIGN KEY(sent_by_admin) REFERENCES admin_users(id) ON UPDATE CASCADE
);
CREATE INDEX idx_message_logs_sent_at ON message_logs(sent_at);
CREATE INDEX idx_message_logs_sent_by_admin ON message_logs(sent_by_admin);

-- メッセージ送信履歴の受信者記録
CREATE TABLE message_log_recipients (
  message_log_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (message_log_id, member_id),
  FOREIGN KEY (message_log_id) REFERENCES message_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);
CREATE INDEX idx_message_log_recipients_member_id ON message_log_recipients(member_id);
CREATE INDEX idx_message_log_recipients_created_at ON message_log_recipients(created_at);

-- 外部キー有効化
PRAGMA foreign_keys = ON;