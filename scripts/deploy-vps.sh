#!/bin/bash

# RC公式LINE VPS展開スクリプト
# Phase A: 最小限のURL変更対応

set -e

echo "🚀 RC公式LINE VPS展開開始 - Phase A"
echo "========================================="

# 現在のディレクトリ確認
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ エラー: /opt/rcline ディレクトリで実行してください"
    exit 1
fi

echo "📁 現在のディレクトリ: $(pwd)"

# 1. Caddyfile バックアップ・更新
echo "🔧 Caddyfile更新中..."
cp caddy/Caddyfile caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)
cp caddy/Caddyfile.vps caddy/Caddyfile
echo "✅ Caddyfile更新完了"

# 2. 静的ファイル用ディレクトリ準備
echo "📁 静的ファイル配置中..."
mkdir -p /var/www/rcline
cp -r services/api-server/public/liff/* /var/www/rcline/
cp services/api-server/public/liff/common.vps.js /var/www/rcline/common.js
echo "✅ 静的ファイル配置完了"

# 3. Docker Compose設定バックアップ・更新
echo "🐳 Docker Compose設定更新中..."
cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S)
cp docker-compose.vps.yml docker-compose.yml

# 4. 環境変数設定
echo "⚙️ 環境変数設定中..."
if [ ! -f ".env.production" ]; then
    echo "❌ エラー: .env.production ファイルが見つかりません"
    exit 1
fi
cp .env.production .env
echo "✅ 環境変数設定完了"

# 5. ログディレクトリ準備
echo "📋 ログディレクトリ準備中..."
mkdir -p logs/line logs/api logs/webhook
chmod 755 logs logs/line logs/api logs/webhook
echo "✅ ログディレクトリ準備完了"

# 6. Docker コンテナ再起動
echo "🔄 Dockerコンテナ再起動中..."
docker compose down
echo "   - コンテナ停止完了"

docker compose up --build -d
echo "   - コンテナ起動完了"

# 7. 動作確認
echo "🔍 動作確認中..."
sleep 10

# サービス状態確認
echo "   - サービス状態:"
docker compose ps

# API接続確認
if curl -f -s http://localhost:4000/api/health > /dev/null; then
    echo "✅ API-Server: 正常"
else
    echo "⚠️  API-Server: 接続確認失敗"
fi

echo ""
echo "🎉 Phase A展開完了!"
echo "========================================="
echo "📝 確認事項:"
echo "   1. https://awf.technavigation.jp/rcline/ でアクセス確認"
echo "   2. 管理画面: https://awf.technavigation.jp/rcline/admin/"
echo "   3. API確認: https://awf.technavigation.jp/rcline/api/health"
echo ""
echo "⚠️  注意事項:"
echo "   - DEV_PUSH_DISABLE=0 のため実際の配信が有効です"
echo "   - テスト時は小規模で実施してください"
echo ""
echo "📋 次のステップ:"
echo "   1. 配信なしテスト実施"
echo "   2. 小規模配信テスト"
echo "   3. 本格運用開始"