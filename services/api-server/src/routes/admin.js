import express from 'express';
import bcrypt from 'bcryptjs';
import { nowJST } from '../database.js';

const router = express.Router();

// 認証ミドルウェア
function requireAuth(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required'
    });
  }
  next();
}

// ログイン
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Username and password required'
    });
  }

  req.db.get(
    'SELECT id, password_hash FROM admin_users WHERE username = ?',
    [username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Database error'
        });
      }

      if (!user || !await bcrypt.compare(password, user.password_hash)) {
        return res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        });
      }

      req.session.adminId = user.id;
      res.json({ ok: true });
    }
  );
});

// ログアウト
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Logout failed'
      });
    }
    res.status(204).send();
  });
});

// 会員一覧（参照のみ）
router.get('/members', requireAuth, (req, res) => {
  const { is_target, has_line } = req.query;
  
  let sql = `
    SELECT id, name, display_order, role, 
           (line_user_id IS NOT NULL) as line_user_id_present,
           is_target, line_display_name
    FROM members 
    WHERE 1=1
  `;
  const params = [];
  
  if (is_target) {
    sql += ' AND is_target = ?';
    params.push(parseInt(is_target));
  }
  
  if (has_line) {
    sql += ' AND line_user_id IS NOT NULL';
  }
  
  sql += ' ORDER BY display_order ASC NULLS LAST, name ASC';
  
  req.db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Database error'
      });
    }
    
    res.json({ items: rows });
  });
});

// audiences一覧
router.get('/audiences', requireAuth, (req, res) => {
  req.db.all(
    'SELECT id, name, sort_order FROM audiences ORDER BY sort_order ASC NULLS LAST, name ASC',
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Database error'
        });
      }
      res.json({ items: rows });
    }
  );
});

export { router as adminRoutes };