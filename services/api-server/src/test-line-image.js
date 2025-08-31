import { Client } from '@line/bot-sdk';
import dotenv from 'dotenv';

// 環境変数の読み込み
if (process.env.NODE_ENV === 'production') {
    dotenv.config({ path: '.env.production' });
} else {
    dotenv.config();
}

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
};

console.log('=== LINE SDK 画像送信テスト開始 ===');
console.log('環境:', process.env.NODE_ENV);
console.log('アクセストークン設定:', config.channelAccessToken ? '設定済み' : '未設定');

if (!config.channelAccessToken) {
    console.error('エラー: LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
    process.exit(1);
}

const client = new Client(config);

// テスト用ユーザーID
const testUserId = 'U45bc8ea2cb931b9ff43aa41559dbc7fc';

// 画像URL（test_image.jpgを使用）
const imageUrl = 'https://awf.technavigation.jp/files/test_image.jpg';

// テストメッセージ（画像）
const imageMessage = {
    type: 'image',
    originalContentUrl: imageUrl,    // フル解像度画像
    previewImageUrl: imageUrl        // プレビュー画像（同じファイルを使用）
};

// テストメッセージ（テキスト）
const textMessage = {
    type: 'text',
    text: '画像送信テスト - ' + new Date().toLocaleString('ja-JP')
};

async function testImageSend() {
    try {
        console.log('画像URL確認:', imageUrl);
        
        console.log('画像メッセージ送信中...');
        await client.pushMessage(testUserId, imageMessage);
        console.log('✅ 画像メッセージ送信成功');
        
        // 少し間を置いてテキストメッセージも送信
        setTimeout(async () => {
            try {
                console.log('テキストメッセージ送信中...');
                await client.pushMessage(testUserId, textMessage);
                console.log('✅ テキストメッセージ送信成功');
                console.log('=== テスト完了 ===');
            } catch (error) {
                console.error('❌ テキストメッセージ送信失敗:', error.message);
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ 画像メッセージ送信失敗:', error.message);
        if (error.originalError) {
            console.error('詳細:', error.originalError);
        }
        
        // エラーの場合でもテキストメッセージは送信してテスト結果を通知
        try {
            await client.pushMessage(testUserId, {
                type: 'text',
                text: '画像送信テスト失敗: ' + error.message
            });
        } catch (textError) {
            console.error('エラー通知の送信も失敗:', textError.message);
        }
    }
}

// テスト実行
testImageSend();