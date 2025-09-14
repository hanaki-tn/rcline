import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { nowJST } from '../database.js';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
// import { sendEventMulticast } from '../line/line-client.js';

const router = express.Router();

// Multer設定（画像アップロード用）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('JPEGファイルのみ対応しています'));
    }
  }
});

// ログイン試行記録（メモリ内）
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 10 * 60 * 1000; // 10分

// 認証ミドルウェア
function requireAuth(req, res, next) {
  if (!req.session.adminUser) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'ログインが必要です'
    });
  }
  next();
}

// ログイン試行チェック
function checkLoginAttempts(username) {
  const attempts = loginAttempts.get(username);
  if (!attempts) return { allowed: true };

  const now = Date.now();
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    return { 
      allowed: false, 
      remainingTime: Math.ceil((attempts.lockedUntil - now) / 1000)
    };
  }

  if (attempts.lockedUntil && now >= attempts.lockedUntil) {
    // ロック期間終了、リセット
    loginAttempts.delete(username);
    return { allowed: true };
  }

  return { allowed: true, currentAttempts: attempts.count || 0 };
}

// ログイン失敗記録
function recordLoginFailure(username) {
  const attempts = loginAttempts.get(username) || { count: 0 };
  attempts.count++;

  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + LOCKOUT_TIME;
    console.log(`ログイン連続失敗によりロック: ${username}, 解除時刻: ${new Date(attempts.lockedUntil).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  }

  loginAttempts.set(username, attempts);
}

// ログイン成功時のクリア
function clearLoginAttempts(username) {
  loginAttempts.delete(username);
}

// POST /api/admin/login
router.post('/login', [
  body('username').trim().isLength({ min: 1 }).withMessage('ユーザー名は必須です'),
  body('password').isLength({ min: 1 }).withMessage('パスワードは必須です')
], async (req, res) => {
  try {
    // バリデーションエラーチェック
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_INPUT',
        message: '入力エラー',
        details: errors.array()
      });
    }

    const { username, password } = req.body;

    // ログイン試行チェック
    const attemptCheck = checkLoginAttempts(username);
    if (!attemptCheck.allowed) {
      return res.status(401).json({
        code: 'ACCOUNT_LOCKED',
        message: `アカウントがロックされています。${attemptCheck.remainingTime}秒後に再試行してください。`
      });
    }

    // ユーザー検索
    const user = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT * FROM admin_users WHERE username = ?',
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      recordLoginFailure(username);
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'ユーザー名またはパスワードが違います'
      });
    }

    // パスワード検証
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      recordLoginFailure(username);
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'ユーザー名またはパスワードが違います'
      });
    }

    // ログイン成功
    clearLoginAttempts(username);
    
    // セッションに保存
    req.session.adminUser = {
      id: user.id,
      username: user.username,
      member_id: user.member_id
    };

    console.log(`管理者ログイン成功: ${username} (ID: ${user.id})`);

    res.json({ 
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        member_id: user.member_id
      }
    });

  } catch (error) {
    console.error('ログインエラー:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'サーバーエラーが発生しました'
    });
  }
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('ログアウトエラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'ログアウトに失敗しました'
      });
    }
    res.json({ ok: true });
  });
});

// GET /api/admin/me - 現在のログイン状況
router.get('/me', (req, res) => {
  if (req.session.adminUser) {
    res.json({
      authenticated: true,
      user: req.session.adminUser
    });
  } else {
    res.json({ authenticated: false });
  }
});

// 会員一覧（参照のみ） - フェーズ1-2
router.get('/members', requireAuth, (req, res) => {
  const { role, has_line } = req.query;
  
  let sql = `
    SELECT id, name, display_order, role, 
           (line_user_id IS NOT NULL) as line_user_id_present,
           is_target, line_display_name,
           created_at, updated_at
    FROM members 
    WHERE 1=1
  `;
  const params = [];
  
  // roleフィルタ（member/staff）
  if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }
  
  if (has_line) {
    sql += ' AND line_user_id IS NOT NULL';
  }
  
  sql += ' ORDER BY display_order, name ASC';
  
  req.db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('会員一覧取得エラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'データベースエラー'
      });
    }
    
    res.json({ items: rows });
  });
});

// audiences一覧 - フェーズ1-3
router.get('/audiences', requireAuth, (req, res) => {
  req.db.all(
    'SELECT id, name, sort_order, created_at, updated_at FROM audiences ORDER BY sort_order, name ASC',
    (err, rows) => {
      if (err) {
        console.error('audiences一覧取得エラー:', err);
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'データベースエラー'
        });
      }
      res.json({ items: rows });
    }
  );
});

// audience作成
router.post('/audiences', requireAuth, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('名前は1-100文字で入力してください'),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('ソート順は0以上の整数にしてください')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: '入力エラー',
      details: errors.array()
    });
  }

  const { name, sort_order } = req.body;
  const now = nowJST();

  req.db.run(
    'INSERT INTO audiences (name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [name, sort_order || null, now, now],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({
            code: 'DUPLICATE_NAME',
            message: 'この名前は既に使用されています'
          });
        }
        console.error('audience作成エラー:', err);
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'データベースエラー'
        });
      }
      res.status(201).json({ id: this.lastID });
    }
  );
});

// audience更新
router.patch('/audiences/:id', requireAuth, [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('名前は1-100文字で入力してください'),
  body('sort_order').optional().isInt({ min: 0 }).withMessage('ソート順は0以上の整数にしてください')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'INVALID_INPUT', 
      message: '入力エラー',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { name, sort_order } = req.body;
  
  let sql = 'UPDATE audiences SET updated_at = ?';
  const params = [nowJST()];

  if (name !== undefined) {
    sql += ', name = ?';
    params.push(name);
  }
  
  if (sort_order !== undefined) {
    sql += ', sort_order = ?';
    params.push(sort_order);
  }

  sql += ' WHERE id = ?';
  params.push(id);

  req.db.run(sql, params, function(err) {
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({
          code: 'DUPLICATE_NAME',
          message: 'この名前は既に使用されています'
        });
      }
      console.error('audience更新エラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'データベースエラー'
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'audienceが見つかりません'
      });
    }

    res.json({ ok: true });
  });
});

// audience削除
router.delete('/audiences/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  req.db.run('DELETE FROM audiences WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('audience削除エラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'データベースエラー'
      });
    }

    if (this.changes === 0) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'audienceが見つかりません'
      });
    }

    res.status(204).send();
  });
});

// audience所属メンバー取得
router.get('/audiences/:id/members', requireAuth, (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT m.id as member_id, m.name, m.display_order,
           (m.line_user_id IS NOT NULL) as line_user_id_present,
           m.is_target, m.role
    FROM audience_members am
    JOIN members m ON am.member_id = m.id
    WHERE am.audience_id = ?
    ORDER BY m.display_order, m.name ASC
  `;

  req.db.all(sql, [id], (err, rows) => {
    if (err) {
      console.error('audience所属メンバー取得エラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'データベースエラー'
      });
    }
    res.json({ items: rows });
  });
});

// audience所属メンバー更新（置換）
router.put('/audiences/:id/members', requireAuth, [
  body('member_ids').isArray().withMessage('member_idsは配列である必要があります'),
  body('member_ids.*').isInt().withMessage('member_idは整数である必要があります')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: '入力エラー',
      details: errors.array()
    });
  }

  const { id } = req.params;
  const { member_ids } = req.body;

  req.db.serialize(() => {
    req.db.run('BEGIN TRANSACTION');

    // 既存の所属を削除
    req.db.run('DELETE FROM audience_members WHERE audience_id = ?', [id], (err) => {
      if (err) {
        req.db.run('ROLLBACK');
        console.error('audience所属削除エラー:', err);
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'データベースエラー'
        });
      }

      // 新しい所属を追加
      if (member_ids.length === 0) {
        req.db.run('COMMIT');
        return res.json({ count: 0 });
      }

      const placeholders = member_ids.map(() => '(?, ?)').join(', ');
      const insertParams = [];
      member_ids.forEach(member_id => {
        insertParams.push(id, member_id);
      });

      req.db.run(
        `INSERT INTO audience_members (audience_id, member_id) VALUES ${placeholders}`,
        insertParams,
        function(err) {
          if (err) {
            req.db.run('ROLLBACK');
            console.error('audience所属追加エラー:', err);
            return res.status(500).json({
              code: 'INTERNAL_ERROR',
              message: 'データベースエラー'
            });
          }

          req.db.run('COMMIT');
          res.json({ count: member_ids.length });
        }
      );
    });
  });
});

// ===== EVENTS API =====

// イベント一覧取得
router.get('/events', requireAuth, (req, res) => {
  const { from, to, query } = req.query;
  
  let sql = `
    SELECT e.id, e.title, e.held_at, e.body, e.created_at,
           e.extra_text_enabled, e.extra_text_label,
           e.image_url, e.image_preview_url,
           COUNT(et.member_id) as target_count
    FROM events e
    LEFT JOIN event_targets et ON e.id = et.event_id
    WHERE 1=1
  `;
  const params = [];
  
  if (from) {
    sql += ' AND date(e.held_at) >= date(?)';
    params.push(from);
  }
  
  if (to) {
    sql += ' AND date(e.held_at) <= date(?)';
    params.push(to);
  }
  
  if (query) {
    sql += ' AND (e.title LIKE ? OR e.body LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }
  
  sql += ' GROUP BY e.id ORDER BY e.held_at DESC';
  
  req.db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('イベント一覧取得エラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'データベースエラー'
      });
    }
    res.json({ items: rows });
  });
});

// イベント詳細取得
router.get('/events/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  const eventSql = `
    SELECT e.*, COUNT(et.member_id) as target_count
    FROM events e
    LEFT JOIN event_targets et ON e.id = et.event_id
    WHERE e.id = ?
    GROUP BY e.id
  `;
  
  req.db.get(eventSql, [id], (err, event) => {
    if (err) {
      console.error('イベント詳細取得エラー:', err);
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'データベースエラー'
      });
    }
    
    if (!event) {
      return res.status(404).json({
        code: 'EVENT_NOT_FOUND',
        message: 'イベントが見つかりません'
      });
    }
    
    // 送信統計取得
    const statsSql = `
      SELECT success_count, fail_count, (success_count + fail_count) as total_count, last_sent_at
      FROM event_push_stats
      WHERE event_id = ?
    `;
    
    req.db.get(statsSql, [id], (err, stats) => {
      if (err) {
        console.error('送信統計取得エラー:', err);
        stats = { success_count: 0, fail_count: 0, total_count: 0, last_sent_at: null };
      }
      
      // 現在の出欠状況取得（最新回答のみ）
      const statusSql = `
        SELECT et.member_id, m.name, m.display_order, m.is_target,
               COALESCE(latest_response.status, 'pending') as status,
               COALESCE(latest_response.extra_text, '') as extra_text,
               latest_response.responded_at,
               COALESCE(latest_response.via, '') as via
        FROM event_targets et
        JOIN members m ON et.member_id = m.id
        LEFT JOIN (
          SELECT er.member_id, er.status, er.extra_text, er.responded_at, er.via,
                 ROW_NUMBER() OVER (PARTITION BY er.member_id ORDER BY er.responded_at DESC) as rn
          FROM event_responses er
          WHERE er.event_id = ?
        ) latest_response ON et.member_id = latest_response.member_id AND latest_response.rn = 1
        WHERE et.event_id = ?
        ORDER BY m.display_order, m.name ASC
      `;
      
      req.db.all(statusSql, [id, id], (err, currentStatus) => {
        if (err) {
          console.error('出欠状況取得エラー:', err);
          currentStatus = [];
        }
        
        res.json({
          id: event.id,
          title: event.title,
          held_at: event.held_at,
          deadline_at: event.deadline_at,
          body: event.body,
          image_url: event.image_url,
          image_preview_url: event.image_preview_url,
          extra_text: {
            enabled: Boolean(event.extra_text_enabled),
            label: event.extra_text_label
          },
          targets_total: event.target_count,
          push_stats: stats || { success_count: 0, fail_count: 0, total_count: 0, last_sent_at: null },
          current_status: currentStatus,
          can_proxy_respond: event.created_by_admin === req.session.adminUser.id // 代理回答権限
        });
      });
    });
  });
});

// CSV出力：最新状態
router.get('/events/:id/export/latest.csv', requireAuth, (req, res) => {
  const { id } = req.params;
  
  // イベント存在確認
  const eventCheckSql = 'SELECT id FROM events WHERE id = ?';
  
  req.db.get(eventCheckSql, [id], (err, event) => {
    if (err) {
      console.error('イベント確認エラー:', err);
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'データベースエラー' });
    }
    
    if (!event) {
      return res.status(404).json({ code: 'EVENT_NOT_FOUND', message: 'イベントが見つかりません' });
    }
    
    // 最新状態のCSV生成
    const csvSql = `
      SELECT et.member_id, m.name,
             COALESCE(latest_response.status, 'pending') as status,
             COALESCE(latest_response.extra_text, '') as extra_text,
             COALESCE(latest_response.via, '') as via
      FROM event_targets et
      JOIN members m ON et.member_id = m.id
      LEFT JOIN (
        SELECT er.member_id, er.status, er.extra_text, er.via,
               ROW_NUMBER() OVER (PARTITION BY er.member_id ORDER BY er.responded_at DESC) as rn
        FROM event_responses er
        WHERE er.event_id = ?
      ) latest_response ON et.member_id = latest_response.member_id AND latest_response.rn = 1
      WHERE et.event_id = ?
      ORDER BY m.display_order, m.name ASC
    `;
    
    req.db.all(csvSql, [id, id], (err, rows) => {
      if (err) {
        console.error('CSV生成エラー:', err);
        return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'CSVエラー' });
      }
      
      // CSV文字列生成
      const csvHeader = 'member_id,name,status,extra_text,via\n';
      const csvData = rows.map(row => 
        `${row.member_id},"${row.name.replace(/"/g, '""')}",${row.status},"${(row.extra_text || '').replace(/"/g, '""')}",${row.via}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event_${id}_latest.csv"`);
      res.send('\ufeff' + csvHeader + csvData); // BOM付きUTF-8
    });
  });
});

// CSV出力：回答履歴
router.get('/events/:id/export/history.csv', requireAuth, (req, res) => {
  const { id } = req.params;
  
  // イベント存在確認
  const eventCheckSql = 'SELECT id FROM events WHERE id = ?';
  
  req.db.get(eventCheckSql, [id], (err, event) => {
    if (err) {
      console.error('イベント確認エラー:', err);
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'データベースエラー' });
    }
    
    if (!event) {
      return res.status(404).json({ code: 'EVENT_NOT_FOUND', message: 'イベントが見つかりません' });
    }
    
    // 履歴のCSV生成
    const csvSql = `
      SELECT er.id as response_id, er.responded_at, er.member_id, m.name, er.status, er.extra_text, er.via
      FROM event_responses er
      JOIN members m ON er.member_id = m.id
      WHERE er.event_id = ?
      ORDER BY er.responded_at DESC
    `;
    
    req.db.all(csvSql, [id], (err, rows) => {
      if (err) {
        console.error('CSV履歴生成エラー:', err);
        return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'CSVエラー' });
      }
      
      // CSV文字列生成
      const csvHeader = 'response_id,responded_at,member_id,name,status,extra_text,via\n';
      const csvData = rows.map(row => 
        `${row.response_id},${row.responded_at},${row.member_id},"${row.name.replace(/"/g, '""')}",${row.status},"${(row.extra_text || '').replace(/"/g, '""')}",${row.via}`
      ).join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event_${id}_history.csv"`);
      res.send('\ufeff' + csvHeader + csvData); // BOM付きUTF-8
    });
  });
});

// イベント作成（画像アップロード付き）
router.post('/events', requireAuth, upload.single('image'), [
  body('title').notEmpty().isLength({ min: 1, max: 100 }).withMessage('タイトルは1〜100文字で入力してください'),
  body('held_at').isISO8601().withMessage('開催日時は有効な日時形式で入力してください'),
  body('deadline_at').optional().isISO8601().withMessage('回答期限は有効な日時形式で入力してください'),
  body('body').optional().isLength({ max: 2000 }).withMessage('本文は2000文字以内で入力してください'),
  body('extra_text_enabled').optional().custom(value => value === 'true' || value === 'false' || typeof value === 'boolean').withMessage('追加メモ欄の設定は真偽値で入力してください'),
  body('extra_text_label').optional().isLength({ max: 50 }).withMessage('追加メモ欄のラベルは50文字以内で入力してください'),
  body('target_member_ids').isJSON().withMessage('対象メンバーIDsはJSON配列で入力してください')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error(`[ERROR] イベント作成バリデーションエラー - User: ${req.session.adminUser?.username}`, errors.array());
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: '入力エラー',
      details: errors.array()
    });
  }

  // 画像チェック
  if (!req.file) {
    return res.status(400).json({
      code: 'IMAGE_REQUIRED',
      message: '画像ファイルは必須です'
    });
  }

  try {
    const { title, held_at, deadline_at, body, extra_text_enabled, extra_text_label, target_member_ids } = req.body;
    
    // target_member_idsをパース
    let memberIds;
    try {
      memberIds = JSON.parse(target_member_ids);
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        throw new Error('対象メンバーは1人以上選択してください');
      }
    } catch (err) {
      return res.status(400).json({
        code: 'INVALID_TARGET_MEMBERS',
        message: '対象メンバーIDsの形式が正しくありません'
      });
    }

    // 開催日時チェック（現在以降）
    const heldAtDate = new Date(held_at);
    const now = new Date();
    if (heldAtDate <= now) {
      return res.status(400).json({
        code: 'INVALID_HELD_AT',
        message: '開催日時は現在以降で設定してください'
      });
    }

    // 回答期限チェック（開催日時以前）
    if (deadline_at) {
      const deadlineDate = new Date(deadline_at);
      if (deadlineDate > heldAtDate) {
        return res.status(400).json({
          code: 'INVALID_DEADLINE',
          message: '回答期限は開催日時より前に設定してください'
        });
      }
      if (deadlineDate <= now) {
        return res.status(400).json({
          code: 'INVALID_DEADLINE',
          message: '回答期限は現在以降で設定してください'
        });
      }
    }

    // 画像処理
    const imageId = uuidv4();
    const originalPath = path.join('/app/files', `${imageId}_original.jpg`);
    const previewPath = path.join('/app/files', `${imageId}_preview.jpg`);
    
    // ディレクトリ存在確認・作成
    await fs.mkdir(path.dirname(originalPath), { recursive: true });
    
    // オリジナル画像保存
    await fs.writeFile(originalPath, req.file.buffer);
    
    // プレビュー画像生成（幅1080px）
    await sharp(req.file.buffer)
      .resize(1080, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(previewPath);

    // URLパス生成
    const imageUrl = `/files/${imageId}_original.jpg`;
    const previewImageUrl = `/files/${imageId}_preview.jpg`;

    // デフォルト本文
    const defaultBody = body || `出欠のご回答をお願いします。\n詳細・回答は以下のリンクからご確認ください。`;

    // データベース処理（トランザクション）
    await new Promise((resolve, reject) => {
      req.db.serialize(() => {
        req.db.run('BEGIN TRANSACTION');
        
        // events テーブルに挿入
        const eventSql = `
          INSERT INTO events (
            title, held_at, deadline_at, body, image_url, image_preview_url,
            extra_text_enabled, extra_text_label,
            created_by_admin, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        req.db.run(eventSql, [
          title,
          held_at,
          deadline_at || null,
          defaultBody,
          imageUrl,
          previewImageUrl,
          extra_text_enabled === 'true' || extra_text_enabled === true ? 1 : 0,
          extra_text_label || '備考',
          req.session.adminUser.id, // admin user ID
          nowJST(),
          nowJST()
        ], function(err) {
          if (err) {
            req.db.run('ROLLBACK');
            return reject(err);
          }
          
          const eventId = this.lastID;
          
          // event_targets に対象メンバーを挿入
          const targetSql = `
            INSERT INTO event_targets (event_id, member_id)
            VALUES ${memberIds.map(() => '(?, ?)').join(', ')}
          `;
          
          const targetParams = [];
          memberIds.forEach(memberId => {
            targetParams.push(eventId, memberId);
          });
          
          req.db.run(targetSql, targetParams, (err) => {
            if (err) {
              req.db.run('ROLLBACK');
              return reject(err);
            }
            
            // ドライラン時は送信をスキップ
            if (process.env.DEV_PUSH_DISABLE === '1') {
              console.log(`[DRY RUN] イベント作成完了: ${eventId}, 対象: ${memberIds.length}名`);
              
              // 模擬送信統計を作成
              const statsSql = `
                INSERT OR REPLACE INTO event_push_stats (event_id, success_count, fail_count, last_sent_at)
                VALUES (?, ?, ?, ?)
              `;
              
              req.db.run(statsSql, [
                eventId, 
                memberIds.length, // 全員成功として扱う
                0, // fail_count
                nowJST()
              ], (err) => {
                if (err) {
                  req.db.run('ROLLBACK');
                  return reject(err);
                }
                
                req.db.run('COMMIT');
                resolve({
                  event_id: eventId,
                  targets: memberIds.length,
                  push: { success: memberIds.length, fail: 0 }
                });
              });
            } else {
              // 実際の LINE 送信処理
              console.log(`[LIVE] LINE送信開始: イベントID=${eventId}, 対象=${memberIds.length}名`);
              
              // イベント情報とメンバー情報を取得
              const eventSql = 'SELECT title, held_at, image_url, image_preview_url FROM events WHERE id = ?';
              req.db.get(eventSql, [eventId], (err, event) => {
                if (err) {
                  req.db.run('ROLLBACK');
                  return reject(err);
                }
                
                // 対象メンバーのline_user_idを取得
                const memberSql = `SELECT line_user_id FROM members WHERE id IN (${memberIds.map(() => '?').join(',')})`;
                req.db.all(memberSql, memberIds, async (err, members) => {
                  if (err) {
                    req.db.run('ROLLBACK');
                    return reject(err);
                  }
                  
                  const lineUserIds = members.map(m => m.line_user_id).filter(Boolean);
                  console.log(`[LIVE] LINE送信対象: ${lineUserIds.length}名`);
                  
                  if (lineUserIds.length === 0) {
                    req.db.run('COMMIT');
                    return resolve({
                      event_id: eventId,
                      targets: memberIds.length,
                      push: { success: 0, fail: 0, note: 'LINE連携済みメンバーなし' }
                    });
                  }
                  
                  // LIFFメッセージを構築
                  const liffUrl = `https://liff.line.me/2007866921-LkR3yg4k?id=${eventId}`;
                  
                  // プレビュー画像URLを構築（httpsスキーム必須）
                  const fullPreviewImageUrl = event.image_preview_url 
                    ? `https://awf.technavigation.jp${event.image_preview_url}`
                    : null;
                  
                  // 日時をフォーマット
                  const heldAtDate = new Date(event.held_at);
                  const formattedDate = heldAtDate.toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Tokyo'
                  });
                  
                  // オリジナル画像URLも構築
                  const fullOriginalImageUrl = event.image_url 
                    ? `https://awf.technavigation.jp${event.image_url}`
                    : null;
                  
                  // SDK経由で送信（一時的に元のコードに戻す）
                  const message = {
                    type: 'flex',
                    altText: `${event.title} - 出欠確認`,
                    contents: {
                      type: 'bubble',
                      hero: fullPreviewImageUrl ? {
                        type: 'image',
                        url: fullPreviewImageUrl,  // プレビュー画像
                        size: 'full',
                        aspectRatio: '20:13',
                        aspectMode: 'cover',
                        action: {
                          type: 'uri',
                          uri: fullOriginalImageUrl || fullPreviewImageUrl  // オリジナル画像、なければプレビュー画像
                        }
                      } : null,
                      body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                          {
                            type: 'text',
                            text: event.title,
                            weight: 'bold',
                            size: 'lg'
                          },
                          {
                            type: 'text',
                            text: formattedDate,
                            size: 'sm',
                            color: '#666666',
                            margin: 'md'
                          }
                        ]
                      },
                      footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                          {
                            type: 'button',
                            style: 'primary',
                            height: 'sm',
                            action: {
                              type: 'uri',
                              label: '出欠を回答',
                              uri: liffUrl
                            }
                          }
                        ]
                      }
                    }
                  };
                  
                  // hero画像がない場合は削除
                  if (!fullPreviewImageUrl) {
                    delete message.contents.hero;
                  }
                  
                  try {
                    // LINE Messaging APIで送信
                    const response = await axios.post('https://api.line.me/v2/bot/message/multicast', {
                      to: lineUserIds,
                      messages: [message]
                    }, {
                      headers: {
                        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    console.log(`[LIVE] LINE送信成功: ${lineUserIds.length}名`);
                    
                    // 送信統計を記録
                    const statsSql = `
                      INSERT OR REPLACE INTO event_push_stats (event_id, success_count, fail_count, last_sent_at)
                      VALUES (?, ?, ?, ?)
                    `;
                    
                    req.db.run(statsSql, [
                      eventId,
                      lineUserIds.length,
                      0,
                      nowJST()
                    ], (err) => {
                      if (err) {
                        req.db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      req.db.run('COMMIT');
                      resolve({
                        event_id: eventId,
                        targets: memberIds.length,
                        push: { success: lineUserIds.length, fail: 0 }
                      });
                    });
                    
                  } catch (error) {
                    console.error(`[LIVE] LINE送信エラー:`, error.response?.data || error.message);
                    
                    // エラー統計を記録
                    const statsSql = `
                      INSERT OR REPLACE INTO event_push_stats (event_id, success_count, fail_count, last_sent_at)
                      VALUES (?, ?, ?, ?)
                    `;
                    
                    req.db.run(statsSql, [
                      eventId,
                      0,
                      lineUserIds.length,
                      nowJST()
                    ], (err) => {
                      if (err) {
                        req.db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      req.db.run('COMMIT');
                      resolve({
                        event_id: eventId,
                        targets: memberIds.length,
                        push: { success: 0, fail: lineUserIds.length, error: error.response?.data || error.message }
                      });
                    });
                  }
                });
              });
            }
          });
        });
      });
    }).then((result) => {
      console.log(`[INFO] イベント作成成功 - User: ${req.session.adminUser.username}, EventID: ${result.event_id}, Targets: ${result.targets}`);
      res.status(201).json(result);
    }).catch((err) => {
      console.error(`[ERROR] イベント作成失敗 - User: ${req.session.adminUser.username}:`, err);
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'イベント作成中にエラーが発生しました'
      });
    });

  } catch (error) {
    console.error('イベント作成処理エラー:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'サーバーエラー'
    });
  }
});

// 代理回答機能
router.post('/events/:id/proxy-response', requireAuth, [
  body('member_id').isInt().withMessage('member_idは整数である必要があります'),
  body('status').isIn(['attend', 'absent']).withMessage('statusはattendまたはabsentである必要があります'),
  body('extra_text').optional().isLength({ max: 200 }).withMessage('追加テキストは200文字以内にしてください')
], async (req, res) => {
  try {
    // バリデーションエラーチェック
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        code: 'INVALID_INPUT',
        message: '入力エラー',
        details: errors.array()
      });
    }

    const { id: eventId } = req.params;
    const { member_id, status, extra_text } = req.body;

    // イベント存在確認と権限確認
    const event = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT id, created_by_admin, extra_text_enabled FROM events WHERE id = ?',
        [eventId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!event) {
      return res.status(404).json({
        code: 'EVENT_NOT_FOUND',
        message: 'イベントが見つかりません'
      });
    }

    // 権限確認：イベント作成者のみ
    if (event.created_by_admin !== req.session.adminUser.id) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'このイベントの代理回答権限がありません'
      });
    }

    // 対象者確認
    const isTarget = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT 1 FROM event_targets WHERE event_id = ? AND member_id = ?',
        [eventId, member_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });

    if (!isTarget) {
      return res.status(400).json({
        code: 'NOT_TARGET',
        message: '指定された会員はこのイベントの対象者ではありません'
      });
    }

    // extra_textの処理
    let finalExtraText = null;
    if (event.extra_text_enabled) {
      finalExtraText = extra_text || null;
    }

    // 代理回答を記録
    await new Promise((resolve, reject) => {
      req.db.run(
        'INSERT INTO event_responses (event_id, member_id, status, extra_text, via, responded_at) VALUES (?, ?, ?, ?, ?, ?)',
        [eventId, member_id, status, finalExtraText, 'admin', nowJST()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    console.log(`[INFO] 代理回答記録 - User: ${req.session.adminUser.username}, Event: ${eventId}, Member: ${member_id}, Status: ${status}`);

    res.json({
      ok: true,
      current: status
    });

  } catch (error) {
    console.error(`[ERROR] 代理回答失敗 - User: ${req.session.adminUser.username}:`, error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'サーバーエラーが発生しました'
    });
  }
});

// ================== メッセージ送信機能 ==================

// audience一覧取得（メッセージ送信用）
router.get('/messages/audiences', requireAuth, (req, res) => {
  const sql = `
    SELECT 
      a.id,
      a.name,
      a.sort_order,
      COUNT(am.member_id) as member_count
    FROM audiences a
    LEFT JOIN audience_members am ON a.id = am.audience_id
    LEFT JOIN members m ON am.member_id = m.id AND m.line_user_id IS NOT NULL
    GROUP BY a.id, a.name, a.sort_order
    ORDER BY a.sort_order ASC
  `;
  
  req.db.all(sql, [], (err, audiences) => {
    if (err) {
      console.error('Audience一覧取得エラー:', err);
      return res.status(500).json({
        success: false,
        error: 'データベースエラー'
      });
    }
    
    res.json({
      audiences: audiences
    });
  });
});

// メッセージ送信
router.post('/messages/send', requireAuth, upload.single('image'), async (req, res) => {
  const { type, message_text, audience_id, include_sender } = req.body;
  const image = req.file;
  
  // バリデーション
  if (!type || !['text', 'image'].includes(type)) {
    return res.status(400).json({
      success: false,
      error: 'メッセージタイプが無効です'
    });
  }
  
  if (!audience_id) {
    return res.status(400).json({
      success: false,
      error: '送信先を選択してください'
    });
  }
  
  if (type === 'text' && (!message_text || message_text.trim().length === 0)) {
    return res.status(400).json({
      success: false,
      error: 'メッセージを入力してください'
    });
  }
  
  if (type === 'image' && !image) {
    return res.status(400).json({
      success: false,
      error: '画像を選択してください'
    });
  }

  try {
    // message-sender.jsをインポート
    const { sendTextMessage, sendImageMessage, buildMessageTargets } = await import('../line/message-sender.js');
    
    // 送信対象リスト作成
    const targetUserIds = await buildMessageTargets(
      parseInt(audience_id),
      include_sender === 'true',
      req.session.adminUser.id,
      req.db
    );
    
    if (targetUserIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: '送信対象が見つかりません'
      });
    }

    let imageUrl = null;
    let imagePreviewUrl = null;
    let imageSize = null;
    let imagePreviewSize = null;
    
    // 画像処理（画像送信の場合）
    if (type === 'image' && image) {
      const fs = await import('fs');
      const path = await import('path');
      const sharp = await import('sharp');
      
      // ファイル保存
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const originalPath = `/app/files/${fileName}_original.jpg`;
      const previewPath = `/app/files/${fileName}_preview.jpg`;
      
      // オリジナル保存
      await fs.promises.writeFile(originalPath, image.buffer);
      imageSize = image.size;
      imageUrl = `${process.env.FILES_PUBLIC_URL_BASE}/${fileName}_original.jpg`;
      
      // プレビュー生成（幅1080px）
      await sharp.default(image.buffer)
        .resize(1080, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(previewPath);
      
      const previewStats = await fs.promises.stat(previewPath);
      imagePreviewSize = previewStats.size;
      imagePreviewUrl = `${process.env.FILES_PUBLIC_URL_BASE}/${fileName}_preview.jpg`;
    }

    // メッセージ送信実行
    let sendResult;
    if (type === 'text') {
      sendResult = await sendTextMessage(targetUserIds, message_text.trim());
    } else {
      sendResult = await sendImageMessage(targetUserIds, imageUrl, imagePreviewUrl);
    }

    // 送信ログ記録
    const logSql = `
      INSERT INTO message_logs (
        type, message_text, image_url, image_preview_url, image_size, image_preview_size,
        audience_id, recipient_count, sent_by_admin, sent_at, success_count, fail_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const now = nowJST();
    
    req.db.run(logSql, [
      type,
      type === 'text' ? message_text.trim() : null,
      imageUrl,
      imagePreviewUrl,
      imageSize,
      imagePreviewSize,
      parseInt(audience_id),
      targetUserIds.length,
      req.session.adminUser.id,
      now,
      sendResult.success_count,
      sendResult.fail_count,
      now,
      now
    ], function(err) {
      if (err) {
        console.error('メッセージログ保存エラー:', err);
        return res.status(500).json({
          success: false,
          error: 'ログ保存に失敗しました'
        });
      }
      
      res.json({
        success: true,
        message_log_id: this.lastID,
        recipient_count: targetUserIds.length,
        success_count: sendResult.success_count,
        fail_count: sendResult.fail_count
      });
    });

  } catch (error) {
    console.error('メッセージ送信エラー:', error);
    res.status(500).json({
      success: false,
      error: 'メッセージ送信に失敗しました'
    });
  }
});

export { router as adminRoutes, requireAuth };