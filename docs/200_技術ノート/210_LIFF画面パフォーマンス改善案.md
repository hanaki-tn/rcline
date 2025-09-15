# 210_LIFF画面パフォーマンス改善案

**作成日**: 2025-01-15  
**優先度**: 中〜高（ユーザー体験に直結）  
**対応時期**: 将来的な改善項目

## 1. 現状の課題

### 1.1 パフォーマンス比較
管理画面（admin.html）と比較して、LIFF画面の表示速度が著しく遅い。

- **管理画面**: 画面切り替えが瞬間的（体感0秒）
- **LIFF画面**: ページ遷移に1-2秒程度かかる

### 1.2 ユーザー体験への影響
- イベント一覧 → イベント詳細の遷移で待ち時間発生
- 出欠回答時のレスポンスが遅く感じる
- 会員の利用満足度に影響

---

## 2. 原因分析

### 2.1 アーキテクチャの違い

| 項目 | 管理画面（高速） | LIFF画面（低速） |
|------|-----------------|-----------------|
| **設計パターン** | SPA（Single Page Application） | MPA（Multi Page Application） |
| **画面切り替え** | DOM操作のみ（hidden/show） | ページ全体の再読み込み |
| **HTML構造** | 全画面が1ファイルに存在 | 各画面が独立したHTMLファイル |
| **初期化処理** | 初回のみ実行 | ページ遷移の度に実行 |
| **データ取得** | メモリキャッシュ活用 | 毎回サーバーから取得 |

### 2.2 LIFF固有のオーバーヘッド

#### 各ページで実行される処理
```javascript
// 1. LIFF SDK初期化（200-500ms）
await liff.init({ liffId: LIFF_ID });

// 2. プロフィール取得（LINE API通信）
const profile = await liff.getProfile();

// 3. 認証トークン検証
const idToken = liff.getIDToken();
```

### 2.3 認証方式の違い

- **管理画面**: Cookie認証（自動送信、軽量）
- **LIFF画面**: IDトークン認証（毎回検証が必要）

---

## 3. 改善案

### 3.1 短期的改善（実装容易度: 高）

#### A. データプリフェッチ
```javascript
// イベント一覧表示時に詳細データも先読み
async function loadEvents() {
    const events = await fetchEvents();
    // 各イベントの詳細もバックグラウンドで取得
    events.forEach(event => {
        prefetchEventDetail(event.id);
    });
}
```

#### B. ローディング表示の改善
- スケルトンスクリーンの導入
- プログレスバーの表示
- 「読み込み中」の明示的な表示

### 3.2 中期的改善（実装容易度: 中）

#### A. 部分的なSPA化
```javascript
// 主要な遷移のみSPA化
// events.html → detail表示を同一ページ内で実現
function showEventDetail(eventId) {
    // URLは変更するが、ページ遷移はしない
    history.pushState({}, '', `#event/${eventId}`);
    // DOM操作で詳細を表示
    document.getElementById('event-list').classList.add('hidden');
    document.getElementById('event-detail').classList.remove('hidden');
}
```

#### B. LIFF初期化の最適化
```javascript
// 初期化結果をセッションストレージにキャッシュ
const cachedProfile = sessionStorage.getItem('liff_profile');
if (cachedProfile && !isExpired(cachedProfile)) {
    return JSON.parse(cachedProfile);
}
```

### 3.3 長期的改善（実装容易度: 低）

#### A. 完全SPA化
- React/Vue.jsなどのフレームワーク導入
- ルーティングライブラリの活用
- 状態管理の統一

#### B. Service Workerの活用
```javascript
// オフライン対応とキャッシュ戦略
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
```

---

## 4. 実装優先順位

### Phase 1（1-2週間で実装可能）
1. ローディング表示の改善
2. データプリフェッチ
3. セッションストレージの活用

### Phase 2（1ヶ月程度）
1. 主要画面の部分的SPA化
2. LIFF初期化の最適化

### Phase 3（2-3ヶ月）
1. 完全SPA化の検討
2. フレームワーク導入の評価

---

## 5. 注意事項

### 5.1 LIFF固有の制約
- セキュリティポリシーによる制限
- LINE側のAPI仕様変更リスク
- 認証トークンの有効期限管理

### 5.2 実装時の考慮点
- 既存機能との互換性維持
- 段階的な移行計画
- テスト環境での十分な検証

---

## 6. 期待効果

### 6.1 定量的効果
- ページ遷移時間: 1-2秒 → 0.2-0.5秒（75%改善）
- 初回読み込み: 変化なし
- 2回目以降: 大幅改善

### 6.2 定性的効果
- ユーザー満足度の向上
- 操作ストレスの軽減
- システム全体の印象改善

---

## 7. 参考情報

### 管理画面の実装（参考にすべき箇所）
```javascript
// services/api-server/public/admin.js
// - showSection() 関数の実装
// - データキャッシュの仕組み
// - イベント駆動の画面更新
```

### LIFF最適化の参考資料
- [LINE Developers - LIFF最適化ガイド](https://developers.line.biz/ja/docs/liff/)
- [Web.dev - SPAパフォーマンス](https://web.dev/spa-performance/)

---

## 8. まとめ

現状のMPAアーキテクチャからSPAアーキテクチャへの段階的な移行により、LIFF画面のパフォーマンスを大幅に改善できる可能性がある。まずは実装が容易な短期的改善から着手し、効果を測定しながら段階的に改善を進めることを推奨する。