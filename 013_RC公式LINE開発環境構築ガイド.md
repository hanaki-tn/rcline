# RC公式LINE開発環境構築ガイド

策定日: 2025年8月23日  
対象: RC公式LINEシステム開発者・新規参画者

## 概要

このガイドは、RC公式LINEシステムの開発環境構築から各種テスト方法まで、実践的な開発手順を体系的にまとめたものです。新規開発者がスムーズにプロジェクトに参画できるよう、具体的なコマンドと設定例を記載しています。

---

## 1. 環境概要・使い分け

### 1.1 環境の位置づけ

**ローカル環境（開発メイン）**:
- 用途: 管理画面UI・LIFF画面・API開発・単体テスト
- 場所: `http://localhost:4000`
- 特徴: Docker構成、署名検証無効、即座のファイル反映

**VPS環境（最終確認）**:
- 用途: LINE Webhook・LIFF実機テスト・配信テスト
- 場所: `https://awf.technavigation.jp`  
- 特徴: HTTPS必須、実LINE API連携、本番相当設定

### 1.2 Docker構成の理解

```yaml
# docker-compose.yml 主要サービス
services:
  api-server:    # メインAPIサーバー（管理画面 + LIFF API + webhook）
  redis:         # ジョブキュー用
  caddy:         # リバースプロキシ・HTTPS終端（VPS用）
  linehook:      # 既存サービス（削除予定）
```

**開発時の特徴** (2025.08.24改善版):
- `public`・`src`ディレクトリは**bind mountで即時反映**
- **Caddyは開発時は自動無効化**（profile制御で起動問題を解決）
- **依存関係を最適化**（redis直接依存、Caddy依存除去）
- **直接ポート4000アクセス**でCaddy不要

---

## 2. 初期環境構築

### 2.1 必要ツール

```bash
# 必須
- Docker Desktop (WSL2 Backend推奨)
- Git
- テキストエディタ（VS Code推奨）

# 推奨
- curl（APIテスト用）
- jq（JSON整形用）
```

### 2.2 プロジェクトセットアップ

```bash
# プロジェクトクローン
git clone <repository-url> rcline
cd rcline

# 環境変数設定（.env.example をコピーして設定）
cp .env.example .env

# 開発用設定例
DEV_ALLOW_INSECURE=1          # 署名検証スキップ
NODE_ENV=development          # 開発モード
LOG_LEVEL=DEBUG              # デバッグログ有効
DEV_PUSH_DISABLE=1           # LINE送信無効化
```

### 2.3 Docker起動

```bash
# 初回ビルド・起動
docker compose up --build -d

# 起動確認
docker compose ps
curl http://localhost:4000/health

# ログ確認
docker compose logs api-server --tail=20
```

**トラブルシューティング** (2025.08.24改善版):
- **ファイル更新が反映されない** → ✅解決済み（srcディレクトリも自動マウント）
- **Caddy起動失敗** → ✅解決済み（開発時は自動無効化）
- **新規ファイル認識されない** → ✅解決済み（bind mount範囲拡大）

**改善前の問題が解決**:
- docker-compose.override.ymlで開発環境を最適化
- 依存関係問題を根本解決
- 開発用API（/api/liff/dev-config）で設定管理を改善

---

## 3. 管理画面開発・テスト

### 3.1 管理画面アクセス

```bash
# 管理画面URL
http://localhost:4000/admin/admin-demo.html

# デフォルトログイン
ユーザー名: hanaki
パスワード: vLJCUJ
```

### 3.2 開発フロー

```bash
# 1. ファイル編集
services/api-server/public/admin-demo.html

# 2. 即座に反映（bind mountによる）
# ブラウザでハードリロード（Ctrl+F5 / Cmd+Shift+R）

# 3. 機能確認
# - ログイン・セッション
# - CRUD操作
# - 代理回答機能
```

### 3.3 API直接テスト

```bash
# ログイン
curl -c cookies.txt -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"hanaki","password":"vLJCUJ"}'

# 認証確認
curl -b cookies.txt http://localhost:4000/api/admin/me

# イベント一覧取得
curl -b cookies.txt http://localhost:4000/api/admin/events
```

---

## 4. LIFF開発・テスト方法

### 4.1 LIFF開発の特徴

**テスト環境**: ブラウザでのテストが基本
- **画面サイズ**: スマホ幅想定（375px〜414px）
- **認証方式**: `x-dev-line-user-id`ヘッダーで擬似認証
- **URL**: `http://localhost:4000/liff/`配下

### 4.2 LIFF画面構成

```
services/api-server/public/liff/
├── index.html      # L-LIST（イベント一覧）
├── detail.html     # L-DETAIL（イベント詳細・回答）
├── register.html   # L-REGISTER（セルフ登録）
├── common.css      # 共通スタイル（レスポンシブ）
└── common.js       # 共通JavaScript
```

### 4.3 レスポンシブ設計方針

```css
/* common.css での設計例 */
/* スマホ最適化 */
@media (max-width: 480px) {
  .container { 
    padding: 10px; 
    max-width: 100%;
  }
  
  /* タッチ操作に適したボタンサイズ */
  button { 
    min-height: 44px; 
    padding: 12px 20px;
    font-size: 16px; /* iOS zoomを防ぐ */
  }
  
  /* テキスト入力 */
  input, textarea {
    font-size: 16px; /* iOS zoomを防ぐ */
    padding: 12px;
  }
}
```

### 4.4 擬似認証の実装方法（2025.08.24改善版）

**開発用テストボタンでの認証切替**:
```javascript
// register.html での開発支援機能
function setTestUser(type) {
  const devConfig = await fetch('/api/liff/dev-config');
  const config = await devConfig.json();
  
  if (type === 'linked') {
    localStorage.setItem('dev-line-user-id', config.defaultUserId);
  } else if (type === 'unlinked') {
    localStorage.setItem('dev-line-user-id', config.unlinkedUserId);
  }
}
```

**JavaScript側での認証ヘッダー送信**:
```javascript
// common.js での実装例（改善版）
function apiRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  // 開発環境では擬似LINE user IDを使用
  if (window.location.hostname === 'localhost') {
    // localStorageから取得、なければデフォルト値
    const devUserId = localStorage.getItem('dev-line-user-id') || 'U45bc8ea2cb931b9ff43aa41559dbc7fc';
    headers['x-dev-line-user-id'] = devUserId;
  }
  
  return fetch(endpoint, {
    ...options,
    headers
  });
}

// 使用例：イベント一覧取得
async function loadEvents() {
  try {
    const response = await apiRequest('/api/liff/events');
    const events = await response.json();
    displayEvents(events);
  } catch (error) {
    console.error('イベント取得エラー:', error);
  }
}
```

### 4.5 開発・テスト手順（2025.08.24改善版）

**1. 簡単なテスト方法**:
```bash
# 基本確認
1. http://localhost:4000/liff/index.html にアクセス
2. 自動的に会員登録画面へ遷移することを確認
3. 画面下部の開発用テストボタンを使用
   - 「未紐付けユーザーに切替」→ リロード
   - 「紐付け済みユーザーに切替」→ リロード
4. 登録可能な名前で実際の登録フロー確認

# デバイス表示確認
F12 → デバイス切り替えアイコン → iPhone SE / Galaxy S21
- iPhone SE (375×667)
- iPhone 12 Pro (390×844) 
- Galaxy S21 (360×800)
```

**2. API連携テスト**:
```bash
# LIFF API直接テスト
curl -H "x-dev-line-user-id: U_test_user_001" \
  http://localhost:4000/api/liff/events

# 会員データ確認（テストユーザー存在確認）
docker compose exec api-server npm run check-members
```

**3. 機能別テスト項目**:

**L-LIST（イベント一覧）**:
- [ ] 自分が対象のイベント表示
- [ ] 自分が作成したイベント表示  
- [ ] 開催日順での並び
- [ ] イベント詳細へのリンク

**L-DETAIL（イベント詳細）**:
- [ ] イベント情報表示（タイトル・日時・画像）
- [ ] 出席・欠席ボタンの動作
- [ ] 出欠状況一覧（🟢⚪✏️表示）
- [ ] 回答履歴の表示・折りたたみ
- [ ] 凡例表示

**L-REGISTER（セルフ登録）**:
- [ ] 氏名入力・送信
- [ ] name_key完全一致照合
- [ ] 既紐づけ上書き防止

### 4.6 デバッグ方法

**ブラウザコンソール活用**:
```javascript
// デバッグ用関数（common.jsに実装推奨）
window.debugLiff = {
  // 現在のユーザー情報確認
  async getCurrentUser() {
    const response = await apiRequest('/api/liff/me');
    console.log('Current User:', await response.json());
  },
  
  // イベント情報確認
  async getEvent(eventId) {
    const response = await apiRequest(`/api/liff/events/${eventId}`);
    console.log('Event:', await response.json());
  }
};

// コンソールで実行
debugLiff.getCurrentUser();
```

**サーバーサイドログ確認**:
```bash
# LIFF APIのログ監視
docker compose logs api-server -f | grep "LIFF"

# 認証関連ログ確認
docker compose logs api-server | grep "x-dev-line-user-id"
```

---

## 5. API開発・デバッグ

### 5.1 API構成

```javascript
// ルート構成
/api/admin/*     // 管理画面API（要認証）
/api/liff/*      // LIFF API（LINE認証）
/api/line/*      // LINE webhook API
```

### 5.2 APIテスト方法

**管理画面API**:
```bash
# セッション認証が必要
curl -c cookies.txt -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"hanaki","password":"vLJCUJ"}'

curl -b cookies.txt http://localhost:4000/api/admin/events
```

**LIFF API**:
```bash
# LINE user ID ヘッダーが必要
curl -H "x-dev-line-user-id: U_test_user_001" \
  http://localhost:4000/api/liff/events

# 回答送信テスト
curl -H "x-dev-line-user-id: U_test_user_001" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:4000/api/liff/events/1/response \
     -d '{"status":"attend","extra_text":"よろしくお願いします"}'
```

### 5.3 データベース直接確認

```bash
# SQLite DBに直接アクセス
docker compose exec api-server sqlite3 /app/data/rcline.db

# よく使うクエリ
.tables                                    # テーブル一覧
SELECT * FROM members LIMIT 5;           # 会員データ確認
SELECT * FROM events ORDER BY held_at;   # イベント一覧
SELECT * FROM event_responses ORDER BY responded_at DESC LIMIT 10;  # 最新回答
```

---

## 6. データベース操作・同期

### 6.1 会員データ同期

```bash
# Google Sheets → DB 同期
docker compose exec api-server npm run sync-members

# 同期結果確認
docker compose exec api-server npm run check-members

# 未紐づけユーザー確認
docker compose exec api-server npm run extract-unlinked-users
```

### 6.2 テストデータ作成

```bash
# 開発用テストデータスクリプト（必要に応じて作成）
docker compose exec api-server node scripts/create-test-data.js
```

---

## 7. VPS環境での最終確認

### 7.1 VPS環境の特徴

```bash
# 場所・設定
場所: /opt/rcline/
URL: https://awf.technavigation.jp/
設定: DEV_ALLOW_INSECURE=0（署名検証有効）
```

### 7.2 VPS環境でのテスト項目

**LINE Webhook**:
- [ ] 友だち追加の自動紐づけ
- [ ] イベント回答の受信・処理

**LIFF実機テスト**:
- [ ] LINE内ブラウザでの表示
- [ ] タッチ操作の応答性
- [ ] 実際の認証フロー

**配信テスト**:
- [ ] 少人数audienceでの配信テスト
- [ ] 画像・メッセージ配信
- [ ] LIFF URLの動作

### 7.3 本番投入前チェックリスト

- [ ] ローカル環境での全機能テスト完了
- [ ] VPS環境でのE2Eテスト完了
- [ ] 配信テスト（少人数）で問題なし
- [ ] ログ出力レベルを本番用に調整
- [ ] 環境変数の本番設定確認
- [ ] データベースバックアップ作成

---

## 8. トラブルシューティング

### 8.1 よくある問題と解決法

**Docker関連**:
- ファイル更新が反映されない → 042_技術ノート_Docker環境_落穂ひろい.md参照
- Caddy起動失敗 → depends_onからcaddy除外

**認証関連**:
- LIFF APIで401エラー → `x-dev-line-user-id`ヘッダー確認
- 管理画面ログインできない → セッション・Cookie確認

**データベース関連**:
- 会員データが古い → 同期コマンド実行
- 回答が保存されない → event_targets確認

### 8.2 ログ確認コマンド

```bash
# 全体ログ
docker compose logs api-server --tail=50

# エラーのみ
docker compose logs api-server | grep ERROR

# 特定の処理追跡
docker compose logs api-server | grep "イベント作成"

# リアルタイム監視
docker compose logs api-server -f
```

---

## 9. 開発のベストプラクティス

### 9.1 コードスタイル

- 043_技術ノート_ログ出力標準.md に従ったログ出力
- エラーハンドリングは必須実装
- ユーザビリティを重視したUI設計

### 9.2 テスト戦略

1. **単体テスト**: API単体での動作確認
2. **結合テスト**: ブラウザでのUI・API連携確認  
3. **E2Eテスト**: VPS環境での実機テスト

### 9.3 継続的改善

- 遭遇した問題は技術ノートに記録
- 開発手順の改善点があれば本ガイド更新
- 新規開発者からのフィードバックを反映

---

## 参考資料

- **設計書**: 012_RC公式LINE設計書.md
- **開発進行**: 016_開発の進め方.md  
- **Docker環境**: 042_技術ノート_Docker環境_落穂ひろい.md
- **ログ標準**: 043_技術ノート_ログ出力標準.md

---

**更新履歴**:
- 2025-08-23: 初版作成（LIFF開発手順を中心に）