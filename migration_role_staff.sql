-- RC公式LINE データベース変更スクリプト
-- members.role に 'staff' を追加し、'admin' を廃止
-- admin_users.member_id を NOT NULL に変更
-- 実行日: 2025-08-20

-- ========================================
-- STEP 1: 既存データの確認
-- ========================================

-- 現在の members.role 分布を確認
.print "=== 現在の members.role 分布 ==="
SELECT role, COUNT(*) as count FROM members GROUP BY role;

-- admin_users の member_id NULL チェック
.print "=== admin_users.member_id が NULL のレコード ==="
SELECT id, username, member_id FROM admin_users WHERE member_id IS NULL;

-- ========================================
-- STEP 2: データ移行・整合性確保
-- ========================================

-- members.role='admin' のレコードがある場合の対処
-- 注意: 実際のデータに応じて手動で staff への変更や admin_users への追加を行う

.print "=== members.role='admin' のレコード確認 ==="
SELECT id, name, role, line_user_id FROM members WHERE role = 'admin';

-- 柴崎さんを staff として追加する例（実際のデータに応じて調整）
-- INSERT INTO members (id, name, name_key, role, is_target, created_at, updated_at)
-- VALUES (99999, '柴崎', '柴崎', 'staff', 0, datetime('now', '+9 hours'), datetime('now', '+9 hours'));

-- admin_users に柴崎さんのエントリを追加する例（実際のデータに応じて調整）  
-- INSERT INTO admin_users (username, password_hash, member_id, created_at, updated_at)
-- VALUES ('shibazaki', '$2b$12$...', 99999, datetime('now', '+9 hours'), datetime('now', '+9 hours'));

-- ========================================
-- STEP 3: テーブル構造変更
-- ========================================

-- SQLite では ALTER TABLE での ENUM 変更や NOT NULL 制約追加が制限されるため
-- 新しいテーブルを作成して移行する方式を採用

.print "=== テーブル構造変更開始 ==="

-- STEP 3-1: members テーブル構造変更
BEGIN TRANSACTION;

-- 新しい members テーブルを作成
CREATE TABLE members_new (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  name_key         TEXT NOT NULL,
  display_order    INTEGER,
  line_user_id     TEXT UNIQUE,
  line_display_name TEXT,
  is_target        INTEGER NOT NULL DEFAULT 0,
  role             TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'staff')),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- インデックスを再作成
CREATE INDEX idx_members_new_name_key ON members_new(name_key);
CREATE INDEX idx_members_new_display_order ON members_new(display_order);
CREATE INDEX idx_members_new_is_target ON members_new(is_target);

-- データをコピー（role='admin' は 'member' に変換）
INSERT INTO members_new (id, name, name_key, display_order, line_user_id, line_display_name, is_target, role, created_at, updated_at)
SELECT 
  id, 
  name, 
  name_key, 
  display_order, 
  line_user_id, 
  line_display_name, 
  is_target,
  CASE 
    WHEN role = 'admin' THEN 'member'  -- 既存 admin は member に変換
    ELSE role 
  END as role,
  created_at,
  updated_at
FROM members;

-- 古いテーブルを削除し、新しいテーブルをリネーム
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;

COMMIT;

-- STEP 3-2: admin_users テーブル構造変更
BEGIN TRANSACTION;

-- 新しい admin_users テーブルを作成（member_id を NOT NULL に）
CREATE TABLE admin_users_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  member_id        INTEGER NOT NULL,  -- NOT NULL 制約を追加
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY(member_id) REFERENCES members(id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- member_id が NOT NULL のレコードのみをコピー
INSERT INTO admin_users_new (id, username, password_hash, member_id, created_at, updated_at)
SELECT id, username, password_hash, member_id, created_at, updated_at
FROM admin_users 
WHERE member_id IS NOT NULL;

-- 古いテーブルを削除し、新しいテーブルをリネーム
DROP TABLE admin_users;
ALTER TABLE admin_users_new RENAME TO admin_users;

COMMIT;

-- ========================================
-- STEP 4: 変更結果確認
-- ========================================

.print "=== 変更後の members.role 分布 ==="
SELECT role, COUNT(*) as count FROM members GROUP BY role;

.print "=== 変更後の admin_users 確認 ==="
SELECT au.id, au.username, au.member_id, m.name, m.role 
FROM admin_users au
JOIN members m ON au.member_id = m.id;

.print "=== スキーマ確認: members ==="
.schema members

.print "=== スキーマ確認: admin_users ==="
.schema admin_users

.print "=== 移行完了 ==="