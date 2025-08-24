import express from 'express';
import { linkByFullName } from '../services/linker.js';
import { nowJST } from '../database.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// LIFF認証ミドルウェア
function requireLineUser(req, res, next) {
  // 本番環境では x-line-user-id ヘッダー使用
  let userId = req.headers['x-line-user-id'];
  
  // 開発環境では x-dev-line-user-id ヘッダーも許可
  if (!userId && process.env.NODE_ENV === 'development') {
    userId = req.headers['x-dev-line-user-id'];
  }
  
  if (!userId) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'LINE user ID required'
    });
  }
  
  req.lineUserId = userId;
  next();
}

// 会員情報取得（userId -> member_id）
function getMemberByLineUserId(db, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, name FROM members WHERE line_user_id = ?',
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// セルフ登録
router.post('/register', requireLineUser, async (req, res) => {
  const { full_name } = req.body;
  
  if (!full_name || full_name.length < 1 || full_name.length > 50) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'full_name must be 1-50 characters'
    });
  }

  try {
    const result = await linkByFullName(req.db, req.lineUserId, full_name);
    
    // NDJSONログ記録
    const logData = {
      ts: nowJST(),
      kind: 'register',
      userId: req.lineUserId,
      inputName: full_name,
      normalized: result.normalizedName,
      result: result.type,
      member_id: result.memberId,
      reason: result.reason
    };
    
    // ログ書き込み
    const date = new Date().toISOString().split('T')[0];
    const logDir = process.env.LOGS_BASE_PATH || '/app/logs';
    const logFile = path.join(logDir, 'line', `REGISTER-${date}.ndjson`);
    
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, JSON.stringify(logData) + '\n');
    
    // レスポンス
    if (result.type === 'LINKED' || result.type === 'ALREADY_LINKED_SAME') {
      res.json({ ok: true });
    } else {
      res.status(404).json({
        code: 'NO_MATCH',
        message: 'No matching member found'
      });
    }
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// イベント一覧（自分が対象）
router.get('/events', requireLineUser, async (req, res) => {
  try {
    const member = await getMemberByLineUserId(req.db, req.lineUserId);
    
    if (!member) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Member not found'
      });
    }

    req.db.all(`
      SELECT DISTINCT e.id, e.title, e.held_at,
             COALESCE((
               SELECT er.status
               FROM event_responses er
               WHERE er.event_id = e.id AND er.member_id = ?
               ORDER BY er.responded_at DESC
               LIMIT 1
             ), 'pending') AS my_status
      FROM events e
      LEFT JOIN event_targets et ON e.id = et.event_id
      LEFT JOIN admin_users au ON e.created_by_admin = au.id
      WHERE et.member_id = ? OR au.member_id = ?
      ORDER BY e.held_at ASC
    `, [member.id, member.id, member.id], (err, rows) => {
      if (err) {
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Database error'
        });
      }
      
      // レスポンス形式をフロントエンド用に調整
      const events = rows.map(row => ({
        id: row.id,
        title: row.title,
        held_at: row.held_at,
        my_response: {
          status: row.my_status
        }
      }));
      
      res.json(events);
    });
    
  } catch (error) {
    console.error('Events list error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// 現在のユーザー情報取得（開発用）
router.get('/me', requireLineUser, async (req, res) => {
  try {
    const member = await getMemberByLineUserId(req.db, req.lineUserId);
    
    if (!member) {
      return res.status(403).json({
        code: 'FORBIDDEN', 
        message: 'Member not found'
      });
    }
    
    res.json({
      member_id: member.id,
      name: member.name,
      line_user_id: req.lineUserId
    });
    
  } catch (error) {
    console.error('User info error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// イベント詳細取得
router.get('/events/:id', requireLineUser, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (!eventId) {
      return res.status(400).json({
        code: 'INVALID_EVENT_ID',
        message: 'Invalid event ID'
      });
    }

    const member = await getMemberByLineUserId(req.db, req.lineUserId);
    if (!member) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Member not found'
      });
    }

    // イベント基本情報取得
    const eventSql = `
      SELECT e.id, e.title, e.held_at, e.body, 
             e.image_url, e.image_preview_url,
             e.extra_text_enabled, e.extra_text_label, e.extra_text_attend_only,
             e.created_by_admin
      FROM events e
      WHERE e.id = ?
    `;
    
    const event = await new Promise((resolve, reject) => {
      req.db.get(eventSql, [eventId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!event) {
      return res.status(404).json({
        code: 'EVENT_NOT_FOUND',
        message: 'Event not found'
      });
    }

    // アクセス権確認（対象者 OR 作成者）
    const accessCheckSql = `
      SELECT 1 as has_access FROM (
        SELECT et.member_id FROM event_targets et WHERE et.event_id = ? AND et.member_id = ?
        UNION
        SELECT au.member_id FROM admin_users au WHERE au.id = ? AND au.member_id = ?
      ) LIMIT 1
    `;

    const hasAccess = await new Promise((resolve, reject) => {
      req.db.get(accessCheckSql, [eventId, member.id, event.created_by_admin, member.id], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });

    if (!hasAccess) {
      return res.status(403).json({
        code: 'ACCESS_DENIED',
        message: 'Access denied for this event'
      });
    }

    // 自分の最新回答取得
    const myResponseSql = `
      SELECT status, extra_text, responded_at, via
      FROM event_responses
      WHERE event_id = ? AND member_id = ?
      ORDER BY responded_at DESC
      LIMIT 1
    `;

    const myResponse = await new Promise((resolve, reject) => {
      req.db.get(myResponseSql, [eventId, member.id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // 出欠状況一覧取得（管理者または対象者の場合）
    const attendanceStatusSql = `
      SELECT et.member_id, m.name, m.is_target,
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
      ORDER BY m.display_order ASC NULLS LAST, m.name ASC
    `;

    const attendanceStatus = await new Promise((resolve, reject) => {
      req.db.all(attendanceStatusSql, [eventId, eventId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // 回答履歴取得
    const responseHistorySql = `
      SELECT er.responded_at, m.name, er.status, er.extra_text, er.via
      FROM event_responses er
      JOIN members m ON er.member_id = m.id
      WHERE er.event_id = ?
      ORDER BY er.responded_at DESC
    `;

    const responseHistory = await new Promise((resolve, reject) => {
      req.db.all(responseHistorySql, [eventId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // レスポンス構築
    const response = {
      id: event.id,
      title: event.title,
      held_at: event.held_at,
      body: event.body,
      image_url: event.image_url,
      image_preview_url: event.image_preview_url,
      extra_text_enabled: !!event.extra_text_enabled,
      extra_text_label: event.extra_text_label,
      extra_text_attend_only: !!event.extra_text_attend_only,
      can_respond: true, // 対象者は回答可能
      my_response: myResponse ? {
        status: myResponse.status,
        extra_text: myResponse.extra_text,
        responded_at: myResponse.responded_at,
        via: myResponse.via
      } : null,
      attendance_status: attendanceStatus,
      response_history: responseHistory
    };

    res.json(response);

  } catch (error) {
    console.error('Event detail error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

// イベント回答送信
router.post('/events/:id/response', requireLineUser, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (!eventId) {
      return res.status(400).json({
        code: 'INVALID_EVENT_ID',
        message: 'Invalid event ID'
      });
    }

    const { status, extra_text = '' } = req.body;
    if (!['attend', 'absent'].includes(status)) {
      return res.status(400).json({
        code: 'INVALID_STATUS',
        message: 'Status must be attend or absent'
      });
    }

    const member = await getMemberByLineUserId(req.db, req.lineUserId);
    if (!member) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Member not found'
      });
    }

    // 対象者確認
    const targetCheckSql = `
      SELECT 1 FROM event_targets WHERE event_id = ? AND member_id = ?
    `;

    const isTarget = await new Promise((resolve, reject) => {
      req.db.get(targetCheckSql, [eventId, member.id], (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });

    if (!isTarget) {
      return res.status(403).json({
        code: 'ACCESS_DENIED',
        message: 'Not a target for this event'
      });
    }

    // 回答を追記型で保存
    const insertSql = `
      INSERT INTO event_responses (event_id, member_id, status, extra_text, responded_at, via)
      VALUES (?, ?, ?, ?, datetime('now'), 'liff')
    `;

    await new Promise((resolve, reject) => {
      req.db.run(insertSql, [eventId, member.id, status, extra_text], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    res.json({ 
      success: true,
      message: 'Response saved successfully'
    });

  } catch (error) {
    console.error('Response submission error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

export { router as liffRoutes };