
# 301_運用メモ_api-serverロギング

## 概要

RC公式LINEシステムのログ管理に関する運用メモ。
Docker Composeのlogging設定により、コンテナ再起動後もログを永続化。

**作成日**: 2025-01-05
**更新日**: 2025-01-05

## ログ設定

### Docker Compose設定（docker-compose.vps.yml）

各サービスに以下のlogging設定を適用：

| サービス | 最大ファイルサイズ | 保持ファイル数 | 最大使用量 |
|---------|------------------|--------------|-----------|
| api-server | 100MB | 10 | 1GB |
| linehook | 50MB | 5 | 250MB |
| caddy | 50MB | 5 | 250MB |
| redis | 20MB | 3 | 60MB |
| **合計** | - | - | **約1.56GB** |

### ログファイル保存場所

```
/var/lib/docker/containers/<container-id>/<container-id>-json.log
```

ローテーション動作:
```
<container-id>-json.log      # 現在のログ（最新）
<container-id>-json.log.1    # 1つ前のログ
<container-id>-json.log.2    # 2つ前のログ
...
<container-id>-json.log.9    # 最古のログ（10個目）
```

## 基本的な運用コマンド

### ログ確認

```bash
# リアルタイム監視
docker compose -f docker-compose.vps.yml logs -f api-server

# 直近100行表示
docker compose -f docker-compose.vps.yml logs --tail=100 api-server

# タイムスタンプ付き表示
docker compose -f docker-compose.vps.yml logs -t api-server

# 全サービスのログ
docker compose -f docker-compose.vps.yml logs

# 特定時刻以降のログ
docker compose -f docker-compose.vps.yml logs --since="2025-01-05T00:00:00" api-server
```

### エラー検索

```bash
# エラーログ抽出
docker compose -f docker-compose.vps.yml logs api-server | grep ERROR

# LINE関連ログ
docker compose -f docker-compose.vps.yml logs api-server | grep "LINE"

# Webhook受信ログ
docker compose -f docker-compose.vps.yml logs api-server | grep "Webhook"

# 署名検証エラー
docker compose -f docker-compose.vps.yml logs api-server | grep "署名検証"
```

### ログファイルを直接確認（高度な使い方）

```bash
# コンテナIDを確認
docker ps --format "table {{.Names}}\t{{.ID}}"

# ログファイルの場所を確認
docker inspect rcline-api-server-1 | grep LogPath

# 直接ファイルを見る（要root権限）
sudo tail -f /var/lib/docker/containers/<container-id>/<container-id>-json.log
```

## エイリアス設定（推奨）

`~/.bashrc`に追加：

```bash
# RC公式LINE ログコマンド
alias rclog='docker compose -f /opt/rcline/docker-compose.vps.yml logs'
alias rclogf='docker compose -f /opt/rcline/docker-compose.vps.yml logs -f'
alias rclogapi='docker compose -f /opt/rcline/docker-compose.vps.yml logs api-server'
alias rclogapif='docker compose -f /opt/rcline/docker-compose.vps.yml logs -f api-server'
```

使用例：
```bash
rclog --tail=50          # 全サービスの直近50行
rclogf                   # 全サービスのリアルタイム監視
rclogapi --tail=100      # api-serverの直近100行
rclogapif                # api-serverのリアルタイム監視
```

## 運用上の注意点

### ログの永続性

| 操作 | ログの状態 |
|-----|----------|
| `docker-compose down` | **保持される** |
| `docker-compose rm` | **保持される** |
| `docker-compose up -d` | 継続（同じコンテナID） |
| コンテナ再作成 | 新規作成（新しいコンテナID） |
| `docker system prune` | **削除される**（停止中のコンテナ） |

### ディスク容量管理

```bash
# Docker全体のディスク使用量確認
docker system df

# ログファイルサイズ確認
sudo du -sh /var/lib/docker/containers/*/

# 不要なリソース削除（注意：停止中コンテナのログも削除）
docker system prune -a
```

### ログバックアップ

重要なログは定期的にバックアップ：

```bash
# 特定日のログをファイルに保存
docker compose -f docker-compose.vps.yml logs api-server > /backup/api-server_$(date +%Y%m%d).log

# 圧縮して保存
docker compose -f docker-compose.vps.yml logs api-server | gzip > /backup/api-server_$(date +%Y%m%d).log.gz
```

## トラブルシューティング

### ログが表示されない

```bash
# コンテナが起動しているか確認
docker compose -f docker-compose.vps.yml ps

# コンテナIDを確認
docker ps --format "table {{.Names}}\t{{.ID}}"

# ログファイルの存在確認
docker inspect <container-name> | grep LogPath
```

### ログローテーションが効かない

1. 設定を確認
```bash
docker inspect <container-name> | grep -A 5 LogConfig
```

2. Docker再起動で設定反映
```bash
docker compose -f docker-compose.vps.yml down
docker compose -f docker-compose.vps.yml up -d
```

### ディスク容量不足

1. 古いコンテナとログを削除
```bash
# 停止中のコンテナを削除
docker container prune

# 1週間以上前のコンテナを削除
docker container prune --filter "until=168h"
```

2. ログ設定を調整（必要に応じて）
```yaml
# max-sizeやmax-fileを小さくする
options:
  max-size: "50m"  # 100mから削減
  max-file: "5"     # 10から削減
```

## 関連ドキュメント

- [134_外部連携_実装マッピング資料.md](134_外部連携_実装マッピング資料.md) - ログ出力箇所の詳細
- [Docker公式ドキュメント - Logging drivers](https://docs.docker.com/config/containers/logging/)

## 更新履歴

- 2025-01-05: 初版作成、Docker Composeログ設定追加
