#!/bin/bash

# 定期自動バックアップスクリプト（現在は無効）
# 使用する場合はcronに登録: 0 2 * * * /opt/rcline/scripts/auto-backup.sh

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="rcline_auto_${TIMESTAMP}.db"

echo "=== 定期自動バックアップ開始 ==="
echo "実行日時: $(date)"

# スクリプトのディレクトリに移動
cd "$(dirname "$0")/.."

# バックアップディレクトリ確認・作成
mkdir -p "$BACKUP_DIR"

# オンラインバックアップ実行
echo "オンラインバックアップ実行中..."
if docker compose exec -T api-server sqlite3 /app/data/rcline.db ".backup /app/data/${BACKUP_FILE}"; then
    # コンテナからホストにコピー
    docker compose cp api-server:/app/data/${BACKUP_FILE} ${BACKUP_DIR}/${BACKUP_FILE}
    
    # コンテナ内の一時ファイル削除
    docker compose exec -T api-server rm -f /app/data/${BACKUP_FILE}
    
    echo "自動バックアップ完了: ${BACKUP_DIR}/${BACKUP_FILE}"
    
    # 7日以上古い自動バックアップを削除
    find "${BACKUP_DIR}" -name "rcline_auto_*.db" -mtime +7 -delete 2>/dev/null || true
    
else
    echo "エラー: 定期バックアップに失敗しました"
    exit 1
fi

echo "=== 定期自動バックアップ完了 ==="
echo "完了日時: $(date)"