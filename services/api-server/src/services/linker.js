import { nowJST } from '../database.js';

// 名前正規化（name_key生成）
export function normalizeName(name) {
  if (!name) return '';
  
  let normalized = name
    .replace(/\s+/g, '') // 全ての空白を削除
    .toLowerCase(); // 英字は小文字化
  
  // NFKCは設定により適用
  if (process.env.ONBOARDING_NAME_NFKC === '1') {
    normalized = normalized.normalize('NFKC');
  }
  
  return normalized;
}

// displayNameによる紐づけ
export async function linkByDisplayName(db, userId, displayName) {
  return new Promise((resolve, reject) => {
    const normalized = normalizeName(displayName);
    
    if (!normalized) {
      return resolve({
        type: 'UNMATCHED',
        reason: 'Empty display name'
      });
    }

    // 候補探索（1件のみ受理）
    db.all(
      'SELECT id, line_user_id FROM members WHERE name_key = ? LIMIT 2',
      [normalized],
      async (err, rows) => {
        if (err) {
          return resolve({
            type: 'ERROR',
            reason: err.message
          });
        }

        if (rows.length === 0) {
          return resolve({
            type: 'UNMATCHED',
            normalizedName: normalized
          });
        }

        if (rows.length > 1) {
          return resolve({
            type: 'AMBIGUOUS',
            normalizedName: normalized,
            reason: 'Multiple matches found'
          });
        }

        const member = rows[0];
        
        // 既に紐づけ済みかチェック
        if (member.line_user_id) {
          if (member.line_user_id === userId) {
            // display_nameを更新
            db.run(
              'UPDATE members SET line_display_name = ?, updated_at = ? WHERE id = ?',
              [displayName, nowJST(), member.id],
              (err) => {
                if (err) {
                  return resolve({
                    type: 'ERROR',
                    reason: err.message
                  });
                }
                resolve({
                  type: 'ALREADY_LINKED_SAME',
                  memberId: member.id,
                  normalizedName: normalized
                });
              }
            );
          } else {
            resolve({
              type: 'ALREADY_LINKED_OTHER',
              memberId: member.id,
              normalizedName: normalized,
              reason: 'Already linked to different user'
            });
          }
        } else {
          // 新規紐づけ
          db.run(
            'UPDATE members SET line_user_id = ?, line_display_name = ?, is_target = 1, updated_at = ? WHERE id = ? AND line_user_id IS NULL',
            [userId, displayName, nowJST(), member.id],
            function(err) {
              if (err) {
                return resolve({
                  type: 'ERROR',
                  reason: err.message
                });
              }
              
              if (this.changes === 1) {
                resolve({
                  type: 'LINKED',
                  memberId: member.id,
                  normalizedName: normalized
                });
              } else {
                resolve({
                  type: 'ALREADY_LINKED_OTHER',
                  memberId: member.id,
                  normalizedName: normalized,
                  reason: 'Concurrent update detected'
                });
              }
            }
          );
        }
      }
    );
  });
}

// フルネームによる紐づけ（LIFF登録用）
export async function linkByFullName(db, userId, inputName) {
  return linkByDisplayName(db, userId, inputName);
}