# RC公式LINE VPS展開手順 - Phase A

## 概要
最小限のURL変更対応（`/rcline/*` パス）で早期運用開始を実現

## 前提条件
- VPSディレクトリ: `/opt/rcline/`
- gitリポジトリ: 同期済み
- 既存Docker環境: 動作中

## 展開手順

### 1. コード更新
```bash
cd /opt/rcline
git pull origin main
```

### 2. 本番環境設定ファイル作成
```bash
# テンプレートから本番設定作成
cp .env.production.template .env.production

# 実際の値に編集（要手動設定）
nano .env.production
```

**設定必須項目**:
- `LINE_CHANNEL_SECRET`: LINE APIシークレット
- `LINE_CHANNEL_ACCESS_TOKEN`: LINEアクセストークン  
- `JWT_SECRET`: 本番用JWT秘密鍵
- `SESSION_SECRET`: セッション秘密鍵
- `CSRF_SECRET`: CSRF保護秘密鍵
- `ADMIN_USERNAME`: 管理者ユーザー名
- `ADMIN_PASSWORD`: 管理者パスワード

### 3. Phase A展開実行
```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

## 展開内容

### URL構造変更
- **新URL**: `https://awf.technavigation.jp/rcline/`
- **API**: `https://awf.technavigation.jp/rcline/api/*`
- **管理画面**: `https://awf.technavigation.jp/rcline/admin/`

### 主要変更ファイル
- `caddy/Caddyfile`: URL routing追加
- `docker-compose.yml`: 本番最適化
- `common.js`: API BaseURL変更
- `.env`: 本番環境設定

### 動作確認項目
1. ✅ メイン画面: `https://awf.technavigation.jp/rcline/`
2. ✅ API疎通: `https://awf.technavigation.jp/rcline/api/health`
3. ✅ 管理画面: `https://awf.technavigation.jp/rcline/admin/`
4. ✅ ログ出力: `logs/` ディレクトリ確認

## 安全運用設定

### 配信テスト段階別設定
```bash
# Phase 1: 配信なしテスト
echo "DEV_PUSH_DISABLE=1" >> .env.production

# Phase 2: 小規模テスト  
echo "DEV_PUSH_DISABLE=0" >> .env.production
# 特定メンバーのみで確認

# Phase 3: 本格運用
# 全メンバー配信開始
```

## トラブルシューティング

### よくある問題
1. **404エラー**: Caddyfile設定確認
2. **API接続失敗**: Docker log確認 `docker compose logs api-server`
3. **静的ファイル未表示**: `/var/www/rcline/` 権限確認

### ログ確認方法
```bash
# リアルタイムログ監視
docker compose logs -f api-server

# LINE webhook ログ
tail -f logs/line/WEBHOOK-$(date +%Y-%m-%d).ndjson

# 全サービス状態
docker compose ps
```

## 次のフェーズ
- **Phase B**: 管理画面UI改善（運用開始後実施）
  - プロキシ応答テキスト入力機能
  - 全会員選択機能
  - 個別会員選択機能

## 注意事項
⚠️ **本展開後は実際のLINE配信が有効になります**  
⚠️ **小規模テストから段階的に実施してください**