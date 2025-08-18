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

-- 外部キー有効化
PRAGMA foreign_keys = ON;