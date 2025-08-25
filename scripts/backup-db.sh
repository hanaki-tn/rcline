#!/bin/bash

# 手動DBバックアップスクリプト
set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rcline_manual_${TIMESTAMP}.db"

echo "=== 手動DBバックアップ開始 ==="
echo "実行日時: $(date)"

# バックアップディレクトリ確認・作成
mkdir -p "$BACKUP_DIR"

# オンラインバックアップ実行
echo "オンラインバックアップ実行中..."
if docker compose exec -T api-server sqlite3 /app/data/rcline.db ".backup /app/data/${BACKUP_FILE}"; then
    # コンテナからホストにコピー
    docker compose cp api-server:/app/data/${BACKUP_FILE} ${BACKUP_DIR}/${BACKUP_FILE}
    
    # コンテナ内の一時ファイル削除
    docker compose exec -T api-server rm -f /app/data/${BACKUP_FILE}
    
    echo "バックアップ完了: ${BACKUP_DIR}/${BACKUP_FILE}"
    
    # バックアップファイルのサイズと作成日時を表示
    ls -lh "${BACKUP_DIR}/${BACKUP_FILE}"
else
    echo "エラー: DBバックアップに失敗しました"
    exit 1
fi

echo "=== 手動DBバックアップ完了 ==="
echo "完了日時: $(date)"