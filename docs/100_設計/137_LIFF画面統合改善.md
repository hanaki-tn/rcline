# 137_LIFF画面統合改善

**作成日**: 2025-01-17
**更新日**: 2025-01-17

## 概要

LIFF画面のパフォーマンス改善のため、個別HTMLファイル（index.html、detail.html）をSPA（Single Page Application）形式の統合版（app.html）に移行する設計と実装。

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

### 2. SPA化による統合（app.html）

#### 特徴
- **単一HTMLファイル**: app.html で全機能を提供
- **JavaScript による画面切り替え**: ページリロードなし
- **LIFF SDK初期化の1回実行**: 初回のみで完了
- **履歴管理**: ブラウザの戻る/進むボタンに対応

#### 対応ビュー
1. **list**: イベント一覧
2. **detail**: イベント詳細
3. **notice**: お知らせ（Notionへのリダイレクト）
4. **zoom**: 例会Zoom参加

### 3. URL構造

```
# 従来
/liff/index.html
/liff/detail.html?id=123

# 新方式
/liff/app.html?view=list
/liff/app.html?view=detail&id=123
/liff/app.html?view=notice
/liff/app.html?view=zoom
```

## 移行方法

### 段階的移行

1. **テスト環境での検証**
   - app.html の動作確認
   - 既存機能の互換性チェック

2. **並行稼働**
   - 既存のindex.html、detail.htmlは維持
   - 新規ユーザーから順次app.htmlへ誘導

3. **完全移行**
   - LINEリッチメニューのURL更新
   - 旧ファイルからapp.htmlへのリダイレクト設定

### リダイレクト設定例

```javascript
// index.html に追加
if (window.location.pathname.endsWith('index.html')) {
    const params = new URLSearchParams(window.location.search);
    const newUrl = 'app.html?view=list';
    if (params.get('id')) {
        newUrl += '&id=' + params.get('id');
    }
    window.location.replace(newUrl);
}
```

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

## 今後の拡張

### 追加予定機能
- プッシュ通知設定画面
- 会員情報更新画面
- イベント履歴表示

### 技術的検討事項
- Service Workerによるオフライン対応
- PWA（Progressive Web App）化
- WebSocketによるリアルタイム更新

## 注意事項

1. **キャッシュクリア**
   - ユーザー情報更新時は`getCurrentUser(true)`で強制更新
   - ログアウト時はセッションストレージをクリア

2. **エラーハンドリング**
   - ネットワークエラー時の再試行処理
   - 認証エラー時の自動再ログイン

3. **互換性**
   - 既存のregister.htmlとの連携維持
   - APIエンドポイントの変更なし

## 関連資料

- [136_出欠依頼メッセージ配信とLIFF遷移フロー.md](136_出欠依頼メッセージ配信とLIFF遷移フロー.md)
- [045_技術ノート_LIFF開発とデバッグ手法_20250829.md](../200_技術ノート/045_技術ノート_LIFF開発とデバッグ手法_20250829.md)