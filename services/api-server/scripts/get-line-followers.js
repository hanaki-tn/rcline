import 'dotenv/config';
import { Client } from '@line/bot-sdk';
import axios from 'axios';

// LINE SDK初期化
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

// アクセストークンチェック
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  console.error('[ERROR] 環境変数 LINE_CHANNEL_ACCESS_TOKEN が設定されていません');
  process.exit(1);
}

// フォロワーのユーザーIDを取得（ページネーション対応）
async function getAllFollowers() {
  const followers = [];
  let start = undefined;
  
  console.log('[INFO] フォロワーのユーザーID取得を開始します...');
  
  try {
    while (true) {
      const url = 'https://api.line.me/v2/bot/followers/ids';
      const params = { limit: 1000 }; // 最大1000件ずつ取得
      if (start) {
        params.start = start;
      }
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
        },
        params: params
      });
      
      const data = response.data;
      
      if (data.userIds && data.userIds.length > 0) {
        followers.push(...data.userIds);
        console.log(`[INFO] ${data.userIds.length}件のユーザーIDを取得しました（累計: ${followers.length}件）`);
      }
      
      // 次のページがあるかチェック
      if (data.next) {
        start = data.next;
      } else {
        break;
      }
    }
    
    console.log(`[INFO] 合計 ${followers.length} 件のフォロワーを取得しました`);
    return followers;
    
  } catch (error) {
    console.error('[ERROR] フォロワー取得エラー:', error.response?.data || error.message);
    throw error;
  }
}

// ユーザープロフィールを取得
async function getUserProfile(userId) {
  try {
    const profile = await client.getProfile(userId);
    return {
      userId: userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      statusMessage: profile.statusMessage,
      language: profile.language
    };
  } catch (error) {
    console.error(`[ERROR] ユーザープロフィール取得エラー (${userId}):`, error.message);
    return {
      userId: userId,
      displayName: 'エラー: 取得できませんでした',
      error: error.message
    };
  }
}

// プロフィール取得の遅延実行（レート制限対策）
async function getUserProfilesWithDelay(userIds) {
  const profiles = [];
  const BATCH_SIZE = 50; // 50件ずつ処理
  const DELAY_MS = 1000; // 1秒待機
  
  console.log(`[INFO] ${userIds.length}件のプロフィール取得を開始します...`);
  
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const batchProfiles = await Promise.all(
      batch.map(userId => getUserProfile(userId))
    );
    
    profiles.push(...batchProfiles);
    
    const progress = Math.min(i + BATCH_SIZE, userIds.length);
    console.log(`[INFO] プロフィール取得進捗: ${progress}/${userIds.length}`);
    
    // 次のバッチ処理前に待機（最後のバッチ以外）
    if (i + BATCH_SIZE < userIds.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  return profiles;
}

// 結果を整形して表示
function displayResults(profiles) {
  console.log('\n========================================');
  console.log('LINE公式アカウント フォロワー一覧');
  console.log('========================================\n');
  
  profiles.forEach((profile, index) => {
    console.log(`【${index + 1}】`);
    console.log(`  LINE表示名: ${profile.displayName || '（未設定）'}`);
    console.log(`  User ID: ${profile.userId}`);
    
    if (profile.statusMessage) {
      console.log(`  ステータスメッセージ: ${profile.statusMessage}`);
    }
    
    if (profile.language) {
      console.log(`  言語設定: ${profile.language}`);
    }
    
    if (profile.error) {
      console.log(`  エラー: ${profile.error}`);
    }
    
    console.log('');
  });
  
  console.log('========================================');
  console.log(`合計: ${profiles.length}名`);
  console.log('========================================');
}

// メイン処理
async function main() {
  try {
    console.log('[INFO] LINE公式アカウントのフォロワー一覧を取得します\n');
    
    // 1. フォロワーのユーザーIDを取得
    const followerIds = await getAllFollowers();
    
    if (followerIds.length === 0) {
      console.log('[INFO] フォロワーが存在しません');
      return;
    }
    
    // 2. 各ユーザーのプロフィール情報を取得
    const profiles = await getUserProfilesWithDelay(followerIds);
    
    // 3. 結果を表示
    displayResults(profiles);
    
    // 4. 統計情報
    const errorCount = profiles.filter(p => p.error).length;
    if (errorCount > 0) {
      console.log(`\n[WARNING] ${errorCount}件のプロフィール取得でエラーが発生しました`);
    }
    
  } catch (error) {
    console.error('[ERROR] 処理中にエラーが発生しました:', error);
    process.exit(1);
  }
}

// スクリプト実行
main();