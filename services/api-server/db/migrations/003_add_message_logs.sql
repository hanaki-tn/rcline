-- メッセージ送信ログテーブル
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