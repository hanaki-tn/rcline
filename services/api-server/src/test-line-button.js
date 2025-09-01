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

console.log('=== LINE SDK ボタンテンプレートテスト開始 ===');
console.log('環境:', process.env.NODE_ENV);
console.log('アクセストークン設定:', config.channelAccessToken ? '設定済み' : '未設定');

if (!config.channelAccessToken) {
    console.error('エラー: LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
    process.exit(1);
}

const client = new Client(config);

// テスト用ユーザーID
const testUserId = 'U45bc8ea2cb931b9ff43aa41559dbc7fc';

// ボタンテンプレートメッセージ
const buttonMessage = {
    type: 'template',
    altText: '出欠確認のお知らせ',
    template: {
        type: 'buttons',
        thumbnailImageUrl: 'https://awf.technavigation.jp/rcline/line-templates/buttons/rsvp_button.png',
        imageAspectRatio: 'rectangle',  // rectangle(1.51:1) or square(1:1)
        imageSize: 'cover',              // cover or contain
        imageBackgroundColor: '#FFFFFF',
        title: 'イベント出欠確認',
        text: '下記ボタンをタップして出欠を回答してください',
        actions: [
            {
                type: 'uri',
                label: '出欠を回答する',
                uri: 'https://awf.technavigation.jp/rcline/liff/detail.html?id=1'
            },
            {
                type: 'uri',
                label: 'イベント詳細を見る',
                uri: 'https://awf.technavigation.jp/rcline/liff/detail.html?id=1'
            }
        ]
    }
};

// テキストメッセージ（事前通知）
const introMessage = {
    type: 'text',
    text: 'ボタンテンプレートのテスト送信です'
};

async function testButtonTemplate() {
    try {
        // まずテキストメッセージを送信
        console.log('導入メッセージ送信中...');
        await client.pushMessage(testUserId, introMessage);
        console.log('✅ 導入メッセージ送信成功');
        
        // 少し間を置いてボタンテンプレートを送信
        setTimeout(async () => {
            try {
                console.log('ボタンテンプレート送信中...');
                console.log('画像URL:', 'https://awf.technavigation.jp/rcline/line-templates/buttons/rsvp_button.png');
                await client.pushMessage(testUserId, buttonMessage);
                console.log('✅ ボタンテンプレート送信成功');
                console.log('=== テスト完了 ===');
                console.log('');
                console.log('確認ポイント:');
                console.log('1. rsvp_button.png画像が表示されているか');
                console.log('2. タイトル「イベント出欠確認」が表示されているか');
                console.log('3. 2つのボタンが表示されているか');
                console.log('4. ボタンをタップするとid=1のイベント詳細画面が開くか');
                console.log('   URL: https://awf.technavigation.jp/rcline/liff/detail.html?id=1');
            } catch (error) {
                console.error('❌ ボタンテンプレート送信失敗:', error.message);
                if (error.originalError) {
                    console.error('詳細エラー:', JSON.stringify(error.originalError, null, 2));
                }
            }
        }, 1000);
        
    } catch (error) {
        console.error('❌ 導入メッセージ送信失敗:', error.message);
        if (error.originalError) {
            console.error('詳細:', error.originalError);
        }
    }
}

// テスト実行
testButtonTemplate();