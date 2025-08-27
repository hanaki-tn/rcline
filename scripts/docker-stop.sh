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

# Docker停止
echo "Dockerコンテナ停止中..."
docker compose down

# DBバックアップ実行（停止後）
echo "DBバックアップ実行中..."
if [ -f "./rcline.db" ]; then
    cp ./rcline.db "${BACKUP_DIR}/${BACKUP_FILE}"
    echo "バックアップ完了: ${BACKUP_DIR}/${BACKUP_FILE}"
else
    echo "警告: DBファイルが見つかりません"
fi

echo "=== Docker停止スクリプト完了 ==="
echo "完了日時: $(date)"