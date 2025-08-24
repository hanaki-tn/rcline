
# Docker環境構築・運用メモ

策定日: 2025年8月22日  
対象: RC公式LINE開発環境

## 概要

このメモは、Rotary Club LINE システム開発で遭遇したDocker環境の課題と解決策を記録し、今後の開発・運用における指針を示すものです。

## 背景となるDocker前提知識

### イメージビルド vs ボリュームマウント

- **イメージビルド**: `COPY`でファイルを**焼き込み**、コンテナ起動時点で固定
  - 利点: 本番環境と同じ状態を保証、デプロイ時の一貫性
  - 欠点: ファイル変更のたびに再ビルドが必要（開発効率低下）

- **ボリュームマウント**: ホストのファイルをコンテナ内にマウント
  - Bind Mount: `./host/path:/container/path`で直接マウント
  - 利点: ファイル変更が即座に反映（開発効率向上）
  - 注意: 本番環境との差異が生まれる可能性

### 依存関係管理（depends_on）

`depends_on`は起動順序を制御するが、**一つのサービスが失敗すると依存する全サービスが起動停止**する特性があります。

## 今回発生した問題と解決

### 問題1: ファイル更新が反映されない

**発生状況**: 
- HTMLファイル（`admin-demo.html`）を更新
- ブラウザでハードリロード・シークレットモード実行
- 変更内容が表示されない

**根本原因**: 
- `public`ディレクトリがコンテナにマウントされていない
- コンテナ内の`/app/public/admin-demo.html`は**ビルド時に焼き込まれた古いバージョン**
- ホスト側の更新とコンテナ内のファイルが完全に分離されている

**詳細検証結果**:
```bash
# ホスト側のファイル確認
md5sum services/api-server/public/admin-demo.html

# コンテナ内のファイル確認  
docker compose exec api-server md5sum /app/public/admin-demo.html
# → ハッシュ値が異なることで問題を確認
```

**解決策**:
```yaml
# docker-compose.ymlのapi-serverサービスに追加
volumes:
  - ./services/api-server/public:/app/public  # bind mountで即時反映
```

### 問題2: Caddy起動失敗による全体停止

**発生状況**:
- `docker compose up`実行時にCaddyサービスが起動失敗
- `depends_on`により、api-serverも起動せず開発がブロック

**エラー詳細**:
```
error mounting ... /etc/caddy/Caddyfile: no such file or directory
```

**根本原因**:
- WSL2 + Docker Desktop環境でのパスマッピング問題
- Caddyfileのマウント先ディレクトリがコンテナ内に存在しない
- 依存関係設定により、Caddy失敗→api-server起動停止

**一時解決策**:
```yaml
# api-serverのdepends_onからCaddyを一時除外
depends_on:
  - redis
  # - caddy  # 一時無効化してapi-server単独起動
```

---

## 開発・本番環境の使い分け方針

### 基本戦略: 段階的構成管理

本プロジェクトでは、**開発効率**と**本番一貫性**を両立するため、以下の段階的アプローチを推奨します：

1. **開発環境**: Bind Mount中心（即時反映優先）
2. **統合テスト**: 本番相当構成（一貫性確認）
3. **本番環境**: イメージ焼き込み（安定性重視）

### 推奨構成1: docker-compose.override.yml活用

**メインファイル（docker-compose.yml）**:
- 本番環境と同じ基本構成を維持
- イメージビルドベースの安定した設定

**開発用オーバーライド（docker-compose.override.yml）**:
```yaml
services:
  api-server:
    volumes:
      - ./services/api-server/public:/app/public    # 開発用bind mount
      - ./services/api-server/src:/app/src          # ソース即時反映（必要時）
    environment:
      - LOG_LEVEL=DEBUG                             # デバッグログ有効
      - NODE_ENV=development
  
  # Caddyを開発時のプロファイル管理で制御
  caddy:
    profiles: ["production", "caddy"]               # 通常は起動しない
```

**運用方法**:
```bash
# 日常開発: overrideが自動適用、bind mountで即時反映
docker compose up -d

# 統合テスト: 本番相当構成での動作確認
docker compose --profile caddy up -d --build

# 本番デプロイ前確認: overrideを無効化
docker compose -f docker-compose.yml up --build
```

### 推奨構成2: 環境別ファイル分離

プロジェクト規模拡大時は、完全分離も検討：

```bash
# ファイル構成
docker-compose.yml              # 共通設定
docker-compose.development.yml  # 開発専用（bind mount等）
docker-compose.production.yml   # 本番専用（最適化設定）
```

---

## WSL2 + Docker Desktop環境での注意点

### パスマッピング問題

WSL2環境では、**Windows → WSL → コンテナ**の3層パスマッピングで問題が発生しやすくなります。

**典型的エラー**:
- `no such file or directory` - マウント先ディレクトリ不存在
- `permission denied` - 権限問題
- `invalid mount config` - パス形式問題

**対策**:
1. **マウント先ディレクトリの事前作成**
   ```dockerfile
   # Dockerfile内で確実にディレクトリ作成
   RUN mkdir -p /etc/caddy /var/log/caddy
   ```

2. **パス存在確認の習慣化**
   ```bash
   # マウント前の確認作業
   docker compose exec service_name ls -la /mount/destination/
   ls -la ./host/path/  # ホスト側も確認
   ```

3. **WSL内パスの使用推奨**
   - Windowsパス（`C:\Users\...`）より WSL内パス（`/home/user/...`）を選択
   - 現在の構成は適切（`/home/admini/projects/rcline`）

### 改行コード・文字エンコーディング

**問題**: Windowsで作成した設定ファイルが Linux コンテナで認識されない

**対策**:
```bash
# 改行コードをLFに統一（設定ファイル全般）
dos2unix caddy/Caddyfile
dos2unix .env

# gitでの自動変換設定
git config core.autocrlf input
```

### 権限問題

WSL2では、Windows側で作成したファイルの権限がLinuxコンテナで問題となる場合があります。

**対策例**:
```bash
# ファイル権限の適切な設定
chmod 644 caddy/Caddyfile
chmod 600 .env  # 環境変数ファイルはより厳しく
```

---

## 日常開発でのトラブルシューティング

### ファイル反映確認方法

**問題判別**: ファイル更新が反映されているかの確認

```bash
# 1. ハッシュ値比較でファイル同一性確認
docker compose exec api-server md5sum /app/public/admin-demo.html
md5sum services/api-server/public/admin-demo.html
# → ハッシュが異なれば、マウント問題あり

# 2. コンテナ内ファイルの直接確認
docker compose exec api-server ls -la /app/public/
docker compose exec api-server head -5 /app/public/admin-demo.html

# 3. ブラウザでのキャッシュ回避確認
# `/admin/admin-demo.html?v=$(date +%s)` でアクセス
```

### サービス起動状況の確認

```bash
# 全サービスの状態確認
docker compose ps

# 特定サービスのログ確認
docker compose logs api-server
docker compose logs caddy

# リアルタイムログ監視
docker compose logs -f api-server
```

### 緊急時の対応フロー

**問題**: Dockerサービスが起動しない・正常動作しない

1. **依存関係の一時無効化**
   ```bash
   # depends_onを無効化してapi-server単独起動
   docker compose up api-server redis
   ```

2. **完全リセット**
   ```bash
   # コンテナ・ボリューム・ネットワークを全削除
   docker compose down -v --remove-orphans
   docker system prune -f
   
   # 再構築
   docker compose up --build -d
   ```

## 推奨運用フロー

### 日常開発サイクル
1. **ファイル編集** （`public/`, `src/` ディレクトリ）
2. **即座に反映確認** （bind mountによる自動反映）
3. **ブラウザでハードリロード** （Ctrl+F5 / Cmd+Shift+R）
4. **必要時のみCaddy起動** （`--profile caddy`オプション使用）

### リリース前確認フロー
1. **開発環境での動作確認完了**
2. **override.ymlを一時無効化**
   ```bash
   mv docker-compose.override.yml docker-compose.override.yml.bak
   ```
3. **本番相当構成での再ビルド・テスト**
   ```bash
   docker compose up --build -d
   ```
4. **問題なければoverride復元**
   ```bash
   mv docker-compose.override.yml.bak docker-compose.override.yml
   ```

### 問題3: 新規ファイルがコンテナで認識されない（srcディレクトリ）

**発生状況**: 
- 新規JavaScriptファイル（`liff_simple.js`）を追加
- ホスト側では存在するがコンテナ内で認識されない
- APIルート自体が404エラーで動作しない

**根本原因**: 
- **srcディレクトリがbind mountされていない**
- 現在の設定では`public`ディレクトリのみbind mount対象
- srcディレクトリのファイルはビルド時にイメージに焼き込み

**詳細分析**:
```bash
# 問題確認
docker compose exec api-server ls -la /app/src/routes/
# → 新規ファイルが存在しない

# 現在のマウント設定
volumes:
  - ./services/api-server/public:/app/public  # publicはマウント済み
  # srcディレクトリはマウントされていない
```

**解決策**:
```bash
# 1. 完全再ビルド（今回の対応）
docker compose down && docker compose up --build -d

# 2. 開発時のsrcマウント追加（恒久対策）
# docker-compose.override.yml に追加
services:
  api-server:
    volumes:
      - ./services/api-server/src:/app/src
    command: npm run dev  # --watchでホットリロード
```

### 前回問題との違い・新しい教訓

**前回（public問題）vs 今回（src問題）**:
- **対象範囲**: HTML表示 vs APIルート機能
- **影響度**: 表示のみ vs アプリケーション全体
- **頻度**: publicは頻繁変更 vs srcは構造変更

**教訓**:
1. **ディレクトリ別のマウント方針理解**
   - `public/`: フロントエンド、頻繁変更 → bind mount推奨
   - `src/`: バックエンド、安定性重視 → 焼き込み基本（開発時は例外）

2. **新規ファイル追加時の確認手順**
   ```bash
   # 追加後必ず確認
   docker compose exec api-server ls -la /app/path/to/new/file
   
   # 見えない場合の対応
   docker compose down && docker compose up --build -d
   ```

3. **開発効率向上のための恒久対策**
   ```yaml
   # docker-compose.override.yml（開発専用）
   services:
     api-server:
       volumes:
         - ./services/api-server/src:/app/src
       command: npm run dev
   ```

### VPS本番環境との差異管理
- **開発**: Bind mount、デバッグログ有効、Caddy無効
- **本番**: イメージ焼き込み、Caddy + HTTPS、ログレベル制限
- **移行時注意点**: 環境変数、ボリュームパス、セキュリティ設定の差異確認

---
