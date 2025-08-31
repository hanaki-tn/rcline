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

console.log('=== LINE SDK テスト開始 ===');
console.log('環境:', process.env.NODE_ENV);
console.log('アクセストークン設定:', config.channelAccessToken ? '設定済み' : '未設定');

if (!config.channelAccessToken) {
    console.error('エラー: LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
    process.exit(1);
}

const client = new Client(config);

// テストメッセージ
const testMessage = {
    type: 'text',
    text: 'LINE SDK テスト送信 - ' + new Date().toLocaleString('ja-JP')
};

// テスト用ユーザーID
const testUserId = 'U45bc8ea2cb931b9ff43aa41559dbc7fc';

async function testLineSend() {
    try {
        console.log('テストメッセージ送信中...');
        await client.pushMessage(testUserId, testMessage);
        console.log('✅ メッセージ送信成功');
    } catch (error) {
        console.error('❌ メッセージ送信失敗:', error.message);
        if (error.originalError) {
            console.error('詳細:', error.originalError);
        }
    }
}

// テスト実行
testLineSend();