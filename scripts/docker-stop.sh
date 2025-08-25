#!/bin/bash

# Docker停止スクリプト（DBバックアップ付き）
set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rcline_stop_${TIMESTAMP}.db"

echo "=== Docker停止スクリプト開始 ==="
echo "実行日時: $(date)"

# バックアップディレクトリ確認・作成
mkdir -p "$BACKUP_DIR"

# DBバックアップ実行
echo "DBバックアップ実行中..."
if docker compose exec -T api-server sqlite3 /app/data/rcline.db ".backup /app/data/${BACKUP_FILE}"; then
    # コンテナからホストにコピー
    docker compose cp api-server:/app/data/${BACKUP_FILE} ${BACKUP_DIR}/${BACKUP_FILE}
    
    # コンテナ内の一時ファイル削除
    docker compose exec -T api-server rm -f /app/data/${BACKUP_FILE}
    
    echo "バックアップ完了: ${BACKUP_DIR}/${BACKUP_FILE}"
else
    echo "警告: DBバックアップに失敗しました"
fi

# Docker停止
echo "Dockerコンテナ停止中..."
docker compose down

echo "=== Docker停止スクリプト完了 ==="
echo "完了日時: $(date)"