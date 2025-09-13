# CLAUDE.md - ClaudeCode開発者向け手引書

## プロジェクト概要

RC公式LINEシステム - LINEボットを使った会員向け出欠確認システム

**開発状況**: 現在開発中、リリースに向けて追い込み中  
**作成日**: 2025-01-05  
**更新日**: 2025-01-05  

## 環境構成

### ローカル環境（開発環境）
- **OS**: Linux on WSL2
- **Docker**: v28.3.2
- **Docker Compose**: v2.39.1（新形式）
- 設定ファイル: `docker compose.yml`

### VPS環境（本番環境）
- カレントディレクトリ: `/opt/rcline`
- **Docker Compose**: v2.x（新形式）
- 設定ファイル: `docker compose.vps.yml`
- デプロイ: Gitを経由してのみファイル転送可能
- **重要**: sparse-checkout設定済み（VPS固有ファイルはpullしない）

### Docker Composeコマンド形式
- **使用形式**: `docker compose`（スペース区切り）- Docker Compose v2
- **旧形式**: `docker-compose`（ハイフン区切り）- 非推奨
- **理由**: 2021年以降、Docker CLIに統合されたサブコマンド形式が標準

## 重要な作業フロー

### コード変更時の必須作業
ClaudeCodeが実装を完了したら、**必ずGitに反映してください**：

```bash
git add <変更ファイル>
git commit -m "適切なコミットメッセージ"
git push
```

### VPS環境への反映
```bash
# VPSサーバーで実行
cd /opt/rcline
git pull
docker compose -f docker compose.vps.yml down
docker compose -f docker compose.vps.yml up -d
```

## 主要な設計書

### 最重要
- **[012_RC公式LINE設計書.md](./012_RC公式LINE設計書.md)** - 全体設計書

### LINE連携
- **[131_外部連携設計.md](../100_設計/131_外部連携設計.md)** - LINE API連携の詳細設計
- **[134_外部連携_実装マッピング資料.md](../100_設計/134_外部連携_実装マッピング資料.md)** - 実装とファイルの対応表
- **[133_Webhookハンドラ設計.md](../100_設計/133_Webhookハンドラ設計.md)** - Webhook処理設計

### 開発・運用
- **[013_RC公式LINE開発環境構築ガイド.md](./013_RC公式LINE開発環境構築ガイド.md)** - 環境構築手順
- **[301_運用メモ_api-serverロギング.md](../300_運用/301_運用メモ_api-serverロギング.md)** - ログ運用方法

## 環境依存ファイル

### 環境変数
| ローカル環境 | VPS環境 | 説明 |
|-------------|---------|------|
| `.env` | `.env.production` | 環境変数（Git対象外） |

### Docker Compose
| ローカル環境 | VPS環境 | VPS適用コマンド |
|-------------|---------|----------------|
| `docker compose.yml` | `docker compose.vps.yml` | `cp -p docker compose.vps.yml docker compose.yml` |

### Caddy設定
| ローカル環境 | VPS環境 | VPS適用コマンド |
|-------------|---------|----------------|
| `caddy/Caddyfile` | `caddy/Caddyfile.vps` | `cp -p caddy/Caddyfile.vps caddy/Caddyfile` |

### LIFF設定
| ローカル環境 | VPS環境 | VPS適用コマンド |
|-------------|---------|----------------|
| `services/api-server/public/liff/common.js` | `services/api-server/public/liff/common.vps.js` | `cp -p services/api-server/public/liff/common.vps.js services/api-server/public/liff/common.js` |

## システム構成

### サービス構成
- **api-server**: メインのAPIサーバー（Node.js/Express）
- **linehook**: LINE Webhook専用サーバー
- **redis**: ジョブキュー用
- **caddy**: リバースプロキシ・SSL終端

### データベース
- **SQLite**: `rcline.db`
- 場所: `/app/data/rcline.db`（コンテナ内）

## 主要なAPIエンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `/api/line/webhook` | LINE Webhook受信 |
| `/api/liff/*` | LIFFアプリ用API |
| `/api/admin/*` | 管理画面用API |

## よく使うコマンド集

### Docker操作
```bash
# ローカル環境
docker compose up -d
docker compose down
docker compose logs -f api-server

# VPS環境
docker compose -f docker compose.vps.yml up -d
docker compose -f docker compose.vps.yml down
docker compose -f docker compose.vps.yml logs -f api-server
```

### ログ確認
```bash
# リアルタイム監視
docker compose -f docker compose.vps.yml logs -f api-server

# エラーログ抽出
docker compose -f docker compose.vps.yml logs api-server | grep ERROR

# LINE関連ログ
docker compose -f docker compose.vps.yml logs api-server | grep "LINE"
```

### データベース確認
```bash
# コンテナ内でSQLite操作
docker compose exec api-server sqlite3 /app/data/rcline.db

# よく使うクエリ
SELECT * FROM members LIMIT 10;
SELECT * FROM events ORDER BY created_at DESC LIMIT 5;
```

## 重要なファイル・ディレクトリ

### アプリケーションコード
```
services/api-server/src/
├── index.js              # メインエントリポイント
├── routes/
│   ├── admin.js          # 管理画面API
│   ├── line.js           # LINE Webhook処理
│   └── liff.js           # LIFF API
├── line/
│   ├── line-client.js    # LINE SDK
│   └── flex-payload.js   # Flexメッセージ構築
└── processors/
    └── linkFollow.js     # 友だち追加処理
```

### フロントエンド
```
services/api-server/public/
├── admin-demo.html       # 管理画面
└── liff/                 # LIFFアプリ
    ├── detail.html       # 出欠回答画面
    └── register.html     # 会員登録画面
```

### ドキュメント構成
```
docs/
├── 000_重要/           # 最重要文書（このCLAUDE.mdを含む）
├── 100_設計/           # 設計文書（恒久保存）
├── 200_技術ノート/     # 技術メモ・ノウハウ（恒久保存）
├── 300_運用/           # 運用関連（恒久保存）
├── 800_作業メモ/       # 短期作業メモ（一時的）
└── 900_アーカイブ/     # 古い作業ログなど
```

## トラブルシューティング

### よくある問題

1. **LINE Webhook署名検証エラー**
   ```bash
   docker logs <container> | grep "署名検証失敗"
   ```
   → `.env.production`の`LINE_CHANNEL_SECRET`を確認

2. **メッセージ送信エラー**
   ```bash
   docker logs <container> | grep "LINE送信エラー"
   ```
   → `LINE_CHANNEL_ACCESS_TOKEN`の有効性を確認

3. **LIFF認証エラー**
   → `LIFF_ID`設定とLIFF URLを確認

### 緊急時の対処
```bash
# サービス再起動
docker compose -f docker compose.vps.yml restart api-server

# ログ大量出力時の確認
docker compose -f docker compose.vps.yml logs --tail=100 api-server
```

## テスト・デバッグ

### テストスクリプト
```bash
# LINE SDK送信テスト
docker compose exec api-server node src/test-line-sdk.js

# 画像送信テスト
docker compose exec api-server node src/test-line-image.js
```

### デバッグモード
環境変数`DEV_PUSH_DISABLE=1`でLINE送信を無効化（ドライラン）

## コーディング規約

### コミットメッセージ
```
機能概要を簡潔に記述

## 変更内容
- 具体的な変更点1
- 具体的な変更点2

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### ログ出力
```javascript
console.log(`[INFO] 正常処理: ${message}`);
console.error(`[ERROR] エラー発生: ${error.message}`);
```

## セキュリティ注意事項

- **秘密鍵ファイル**: Git対象外、紛失中（要再設定）
- **環境変数**: `.env*`ファイルはGit対象外
- **LINEトークン**: ログに出力しない

## 今後の改善予定

1. VPS環境へのSSH設定復旧
2. 設計書のdocs/フォルダ整理
3. 自動テスト環境構築

---

**重要**: 実装完了時は必ず`git add`、`git commit`、`git push`を実行してください。