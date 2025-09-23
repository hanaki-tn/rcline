# 137_LIFF画面統合改善

**作成日**: 2025-09-18
**更新日**: 2025-09-20（認証エラー暫定対応追加）

## 概要

LIFF画面のパフォーマンス改善のため、認証処理を共通化し、個別HTMLファイル（index.html、detail.html）を分離した3つの独立ページに再構成する設計と実装。

## 改善内容

### 1. 認証処理の共通化（実装済み）

#### セッションキャッシュ機能
- `sessionStorage`を使用した1時間のキャッシュ
- 画面遷移時の認証処理を削減
- `/api/liff/me`の呼び出し回数を大幅削減

```javascript
// common.js に追加された機能
const SESSION_CACHE = {
    USER_KEY: 'liff_user_info',
    EXPIRE_KEY: 'liff_user_expire',
    CACHE_DURATION: 60 * 60 * 1000 // 1時間
};
```

### 2. 共通認証モジュール（auth.js）

#### 特徴
- **LIFFAuth クラス**: 全ページで共通利用
- **統一された認証フロー**: LIFF初期化→ユーザー情報取得→紐付け確認
- **エラーハンドリング内蔵**: 認証失敗時の自動処理
- **開発環境対応**: デバッグ情報表示機能

#### 利用方法
```javascript
// 各HTMLページで共通利用
const currentUser = await liffAuth.initialize({
    redirectToRegister: true,
    fromPage: 'events'  // または 'notice', 'zoom'
});
```

### 3. 分離されたページ構成

#### 3つの独立したHTMLページ
1. **events.html**: イベント一覧・詳細（SPA形式）
   - イベント一覧表示
   - イベント詳細表示
   - 出欠回答機能
   - detail.htmlの全機能を統合

2. **notice.html**: お知らせページ
   - Notionページへの自動リダイレクト
   - 認証チェック付き

3. **zoom.html**: 例会Zoom参加ページ
   - Zoom参加情報表示
   - ワンクリック参加機能

### 4. URL構造

```
# 従来
/liff/index.html                    # イベント一覧
/liff/detail.html?id=123            # イベント詳細

# 新方式
/liff/events.html                   # イベント一覧
/liff/events.html?view=detail&id=123 # イベント詳細
/liff/notice.html                   # お知らせ
/liff/zoom.html                     # Zoom参加
```

## 移行方法

### 段階的移行

1. **テスト環境での検証**
   - events.html の動作確認
   - 既存機能の互換性チェック
   - LIFF エンドポイント設定の更新

2. **並行稼働**
   - 既存のindex.html、detail.htmlは維持
   - 新しいLIFF IDでevents.htmlをテスト稼働

3. **完全移行**
   - LINEリッチメニューのURL更新
   - 旧ファイルからevents.htmlへのリダイレクト設定

### LIFF設定

#### 必要なLIFF ID設定
```
イベント用: https://awf.technavigation.jp/rcline/liff/events.html
お知らせ用: https://awf.technavigation.jp/rcline/liff/notice.html
Zoom用:    https://awf.technavigation.jp/rcline/liff/zoom.html
```

#### 現在判明している技術課題
1. **旧LIFF IDの認証エラー**
   - エラー: `liffId is necessary for liff.init()`
   - 対象: 旧LIFF ID `2007866921-LkR3yg4k` (old_common.js)
   - 原因: LIFF IDの無効化または設定変更

2. **LIFF エンドポイント不一致警告**
   - events.html にアクセスしているが、LIFF設定は index.html になっている
   - LINE Developersコンソールでエンドポイント更新が必要

3. **LINEアプリキャッシュ問題**
   - スクリプト更新がすぐに反映されない
   - キャッシュバスター追加で対応中

## パフォーマンス改善効果

### 測定結果（想定）
| 項目 | 従来 | 改善後 | 削減率 |
|-----|------|--------|--------|
| 画面遷移時間 | 3-5秒 | 0.5-1秒 | 80% |
| API呼び出し回数 | 4回 | 1回 | 75% |
| LIFF初期化 | 毎回 | 初回のみ | - |

### 改善ポイント
1. **認証処理**: セッションキャッシュで最大60分間再利用
2. **画面遷移**: DOM操作のみで高速化
3. **ネットワーク**: 必要最小限のAPI呼び出し

## 開発・デバッグ機能

### セッションキャッシュクリア方法

#### 1. ブラウザ開発者ツール
```javascript
// Application/Storage タブまたはコンソールで実行
sessionStorage.clear();
localStorage.clear();
```

#### 2. URLパラメータ（実装予定）
```
https://awf.technavigation.jp/rcline/liff/events.html?clear=1
```

#### 3. デバッグ関数（実装予定）
```javascript
// 開発環境のみ利用可能
window.debugLiff.clearSession();
```

## 認証エラー対応（暫定措置）

### 旧バージョンファイルの廃止対応
- **対象ファイル**: index.html, detail.html (old_common.js使用)
- **状態**: 廃止予定（現在少数ユーザーのみアクセス可能）
- **問題**: 旧LIFF ID (`2007866921-LkR3yg4k`) での認証エラー発生
- **暫定対応**:
  - 認証失敗時に「システムメンテナンス中」メッセージを表示
  - エラーメッセージは復旧可能なようコメントアウトで保持

### デバッグログ追加（2025-09-20）
old_common.js にLIFF ID診断ログを追加：
```javascript
// LIFF ID詳細ログ
showDebugLog(`CONFIG.LIFF_ID の値: "${CONFIG.LIFF_ID}" (type: ${typeof CONFIG.LIFF_ID})`, 'info');
showDebugLog(`LIFF_ID の長さ: ${CONFIG.LIFF_ID?.length || 'undefined'}`, 'info');
showDebugLog(`liff.init()に渡したliffId: "${CONFIG.LIFF_ID}"`, 'error');
```

## 注意事項

1. **LIFF設定の更新必須**
   - 各ページごとに適切なエンドポイントURLを設定
   - エンドポイント不一致は認証エラーの原因となる可能性

2. **キャッシュ管理**
   - セッションストレージは同一ドメイン内で共有
   - ユーザー情報更新時は`getCurrentUser(true)`で強制更新

3. **互換性維持**
   - 既存のregister.htmlとの連携維持
   - APIエンドポイントの変更なし
   - common.jsの変更は後方互換性を確保

## 実装状況

### 実装済み
- ✅ セッションキャッシュ機能（common.js）
- ✅ events.html（イベント一覧・詳細統合版）
- ✅ 新LIFF ID対応（`2007866921-kw3W8dBv`）
- ✅ 旧バージョン暫定対応（メンテナンス中表示）

### 実装予定
- ⏳ auth.js（共通認証モジュール）
- ⏳ notice.html（お知らせページ）
- ⏳ zoom.html（Zoom参加ページ）
- ⏳ URLパラメータによるキャッシュクリア機能

## 今後の拡張

### 追加予定機能
- notice.html, zoom.html の本格実装
- プッシュ通知設定画面
- 会員情報更新画面
- イベント履歴表示

### 技術的検討事項
- Service Workerによるオフライン対応
- PWA（Progressive Web App）化
- WebSocketによるリアルタイム更新

## 関連資料

- [136_出欠依頼メッセージ配信とLIFF遷移フロー.md](136_出欠依頼メッセージ配信とLIFF遷移フロー.md)
- [045_技術ノート_LIFF開発とデバッグ手法_20250829.md](../200_技術ノート/045_技術ノート_LIFF開発とデバッグ手法_20250829.md)