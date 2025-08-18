import express from 'express';
import { linkByFullName } from '../services/linker.js';
import { nowJST } from '../database.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// LIFF認証ミドルウェア
function requireLineUser(req, res, next) {
  const userId = req.headers['x-line-user-id'];
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
      SELECT e.id, e.title, e.held_at,
             COALESCE((
               SELECT er.status
               FROM event_responses er
               WHERE er.event_id = e.id AND er.member_id = ?
               ORDER BY er.responded_at DESC
               LIMIT 1
             ), 'pending') AS my_status
      FROM events e
      INNER JOIN event_targets et ON e.id = et.event_id
      WHERE et.member_id = ?
      ORDER BY 
        CASE WHEN my_status = 'pending' THEN 0 ELSE 1 END,
        e.held_at ASC
    `, [member.id, member.id], (err, rows) => {
      if (err) {
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Database error'
        });
      }
      
      res.json({ items: rows });
    });
    
  } catch (error) {
    console.error('Events list error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    });
  }
});

export { router as liffRoutes };