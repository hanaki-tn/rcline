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
    // 第1段階：name_keyで検索
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

        // name_keyでマッチした場合は既存処理を継続
        if (rows.length > 0) {
          handleMatchedMembers(rows, normalized, userId, displayName, db, resolve);
          return;
        }

        // 第2段階：line_display_nameで検索（fallback）
        db.all(
          'SELECT id, line_user_id FROM members WHERE line_display_name = ? LIMIT 2',
          [displayName],
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
                normalizedName: normalized,
                reason: 'No match found by name_key or line_display_name'
              });
            }

            handleMatchedMembers(rows, normalized, userId, displayName, db, resolve);
          }
        );
      }
    );

    // マッチしたメンバーの処理（共通化）
    function handleMatchedMembers(rows, normalized, userId, displayName, db, resolve) {

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
  });
}

// フルネームによる紐づけ（LIFF登録用）
export async function linkByFullName(db, userId, inputName, actualDisplayName) {
  return new Promise((resolve, reject) => {
    const normalized = normalizeName(inputName);  // 入力名で検索
    const displayNameToSave = actualDisplayName || inputName;  // 保存するのはLINE表示名

    if (!normalized) {
      return resolve({
        type: 'UNMATCHED',
        reason: 'Empty input name'
      });
    }

    // name_keyでのみ検索（register時はline_display_name検索は行わない）
    db.all(
      'SELECT id, line_user_id FROM members WHERE name_key = ? LIMIT 2',
      [normalized],
      (err, rows) => {
        if (err) {
          return resolve({
            type: 'ERROR',
            reason: err.message
          });
        }

        if (rows.length === 0) {
          return resolve({
            type: 'UNMATCHED',
            normalizedName: normalized,
            reason: 'No match found by name_key'
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
            // line_display_nameを正しいLINE表示名で更新
            db.run(
              'UPDATE members SET line_display_name = ?, updated_at = ? WHERE id = ?',
              [displayNameToSave, nowJST(), member.id],
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
              normalizedName: normalized,
              reason: `Already linked to different user: ${member.line_user_id}`
            });
          }
        } else {
          // 新規紐づけ
          db.run(
            'UPDATE members SET line_user_id = ?, line_display_name = ?, updated_at = ? WHERE id = ?',
            [userId, displayNameToSave, nowJST(), member.id],
            (err) => {
              if (err) {
                return resolve({
                  type: 'ERROR',
                  reason: err.message
                });
              }

              resolve({
                type: 'LINKED',
                memberId: member.id,
                normalizedName: normalized
              });
            }
          );
        }
      }
    );
  });
}