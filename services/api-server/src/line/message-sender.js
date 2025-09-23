import { Client } from '@line/bot-sdk';

// LINE SDK クライアント作成
const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
});

/**
 * テキストメッセージ送信
 * @param {Array<string>} userIds - 送信対象のLINEユーザーIDリスト
 * @param {string} text - 送信するテキスト
 * @returns {Promise<{success_count: number, fail_count: number}>}
 */
export async function sendTextMessage(userIds, text) {
  if (process.env.DEV_PUSH_DISABLE === '1') {
    console.log('[DEV] テキストメッセージ送信をスキップしました');
    console.log(`[DEV] 対象: ${userIds.length}名`);
    console.log(`[DEV] テキスト: ${text}`);
    return { success_count: userIds.length, fail_count: 0 };
  }

  const message = {
    type: 'text',
    text: text
  };

  return await sendMessageToUsers(userIds, message);
}

/**
 * 画像メッセージ送信
 * @param {Array<string>} userIds - 送信対象のLINEユーザーIDリスト
 * @param {string} imageUrl - 送信する画像のURL
 * @param {string} previewUrl - プレビュー画像のURL
 * @returns {Promise<{success_count: number, fail_count: number}>}
 */
export async function sendImageMessage(userIds, imageUrl, previewUrl) {
  if (process.env.DEV_PUSH_DISABLE === '1') {
    console.log('[DEV] 画像メッセージ送信をスキップしました');
    console.log(`[DEV] 対象: ${userIds.length}名`);
    console.log(`[DEV] 画像URL: ${imageUrl}`);
    return { success_count: userIds.length, fail_count: 0 };
  }

  const message = {
    type: 'image',
    originalContentUrl: imageUrl,
    previewImageUrl: previewUrl
  };

  return await sendMessageToUsers(userIds, message);
}

/**
 * 送信対象リスト作成
 * @param {number} audienceId - audienceのID
 * @param {boolean} includeSender - 送信者を含むかどうか
 * @param {number} adminUserId - 管理者ユーザーのID
 * @param {object} db - データベース接続
 * @returns {Promise<{userIds: Array<string>, memberIds: Array<number>}>}
 */
export async function buildMessageTargets(audienceId, includeSender, adminUserId, db) {
  return new Promise((resolve, reject) => {
    // audienceのメンバー取得
    const audienceSql = `
      SELECT m.id as member_id, m.line_user_id
      FROM audience_members am
      JOIN members m ON am.member_id = m.id
      WHERE am.audience_id = ? AND m.line_user_id IS NOT NULL
    `;

    db.all(audienceSql, [audienceId], (err, audienceMembers) => {
      if (err) {
        return reject(err);
      }

      let targetUserIds = audienceMembers.map(member => member.line_user_id);
      let targetMemberIds = audienceMembers.map(member => member.member_id);

      if (includeSender) {
        // 送信者のline_user_id取得
        const adminSql = `
          SELECT m.id as member_id, m.line_user_id
          FROM admin_users au
          JOIN members m ON au.member_id = m.id
          WHERE au.id = ? AND m.line_user_id IS NOT NULL
        `;

        db.get(adminSql, [adminUserId], (err, admin) => {
          if (err) {
            return reject(err);
          }

          if (admin && admin.line_user_id) {
            // 重複排除
            if (!targetUserIds.includes(admin.line_user_id)) {
              targetUserIds.push(admin.line_user_id);
              targetMemberIds.push(admin.member_id);
            }
          }

          resolve({ userIds: targetUserIds, memberIds: targetMemberIds });
        });
      } else {
        resolve({ userIds: targetUserIds, memberIds: targetMemberIds });
      }
    });
  });
}

/**
 * メッセージ送信実行
 * @param {Array<string>} userIds - 送信対象のLINEユーザーIDリスト
 * @param {object} message - 送信するメッセージオブジェクト
 * @returns {Promise<{success_count: number, fail_count: number}>}
 */
async function sendMessageToUsers(userIds, message) {
  let success_count = 0;
  let fail_count = 0;

  if (userIds.length === 0) {
    return { success_count, fail_count };
  }

  try {
    if (userIds.length === 1) {
      // 1名の場合はpushMessage
      await lineClient.pushMessage(userIds[0], message);
      success_count = 1;
    } else if (userIds.length <= 500) {
      // 500名以下の場合はmulticast
      await lineClient.multicast(userIds, message);
      success_count = userIds.length;
    } else {
      // 500名超の場合は分割送信
      for (let i = 0; i < userIds.length; i += 500) {
        const chunk = userIds.slice(i, i + 500);
        try {
          await lineClient.multicast(chunk, message);
          success_count += chunk.length;
        } catch (error) {
          console.error(`Batch ${Math.floor(i/500) + 1} 送信エラー:`, error);
          fail_count += chunk.length;
        }
      }
    }
  } catch (error) {
    console.error('LINE メッセージ送信エラー:', error);
    fail_count = userIds.length;
  }

  return { success_count, fail_count };
}