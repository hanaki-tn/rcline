-- メッセージ送信履歴の受信者記録テーブル
CREATE TABLE IF NOT EXISTS message_log_recipients (
    message_log_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (message_log_id, member_id),
    FOREIGN KEY (message_log_id) REFERENCES message_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id)
);

-- 検索性能向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_message_log_recipients_member_id
    ON message_log_recipients(member_id);

CREATE INDEX IF NOT EXISTS idx_message_log_recipients_created_at
    ON message_log_recipients(created_at);

-- 確認用コメント
-- このテーブルは、メッセージ送信時点での受信者を記録し、
-- 後から送信グループのメンバーが変更されても履歴を正確に保持するために使用されます。