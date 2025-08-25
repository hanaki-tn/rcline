#!/bin/bash

# Docker起動スクリプト
set -e

echo "=== Docker起動スクリプト開始 ==="
echo "実行日時: $(date)"

# Docker起動
echo "Dockerコンテナ起動中..."
docker compose up -d

# 起動確認
echo "起動確認中..."
sleep 5
docker compose ps

echo "=== Docker起動スクリプト完了 ==="
echo "完了日時: $(date)"