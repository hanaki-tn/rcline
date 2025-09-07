# LIFF認証エラー トラブルシューティング

## 1. 問題の症状

### エラーメッセージ
- 「開発中のLIFFアプリです」のエラーページが表示される
  ```
  LINE
  400 Bad Request
  This channel is now developing status.
  User need to have developer rolo.
  ```
- LIFF URLアクセス時に認証が通らない
- 本番環境でのアクセスが制限される

### 発生状況
- LIFF URLにアクセスした際
- LINEアプリ内ブラウザでの表示時
- 開発者以外のユーザーがアクセスした場合

## 2. 原因

LIFFアプリの公開ステータスが「開発中」になっている場合、以下の制限が発生します：

- 開発者（チャンネル管理者）以外はアクセスできない
- 本番環境での一般ユーザー利用が不可
- LINE Developersコンソールで設定したテスターのみアクセス可能

## 3. 解決方法

### 方法1: LIFFアプリを公開する（推奨）
1. LINE Developers コンソールにアクセス
2. 対象のMessaging APIチャンネルを選択
3. 「LIFF」タブを開く
4. 対象のLIFFアプリの「公開ステータス」を「公開」に変更
5. 設定を保存

### 方法2: テスターとして追加する（一時的対応）
1. LINE Developers コンソールにアクセス
2. 対象のMessaging APIチャンネルを選択
3. 「LIFF」タブを開く
4. 対象のLIFFアプリの設定画面で「テスター」を追加
5. アクセスが必要なユーザーのLINE IDを登録

## 4. 注意事項

- **公開は不可逆**: 一度公開したLIFFアプリを開発中に戻すことはできません
- **十分なテスト**: 公開前に必ず開発環境で動作確認を行ってください
- **セキュリティ確認**: 公開前にセキュリティ面での確認を実施してください
- **エラーハンドリング**: 公開後のエラー対応体制を整えてください

## 5. 参考情報

### LINE Developers設定場所
- URL: https://developers.line.biz/console/
- 設定パス: プロバイダー > チャンネル > LIFF > 各LIFFアプリの設定
- 必要な権限: チャンネル管理者またはDeveloper権限

### 関連ドキュメント
- [LINE公式: LIFFアプリの公開](https://developers.line.biz/ja/docs/liff/publishing-liff-apps/)
- [LINE公式: LIFFアプリのテスト](https://developers.line.biz/ja/docs/liff/testing-liff-apps/)