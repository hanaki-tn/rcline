import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import flash from 'connect-flash';
import { createDatabase } from './database.js';
import { createQueue } from './queue.js';
import { adminRoutes } from './routes/admin.js';
import { liffRoutes } from './routes/liff.js';
import { lineRoutes } from './routes/line.js';

const app = express();
const PORT = process.env.PORT || 4000;

// ミドルウェア
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // デモページ用にインラインスクリプトを許可
      scriptSrcAttr: ["'unsafe-inline'"], // デモページ用にインラインイベントハンドラーを許可
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// レート制限
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100 // 最大100リクエスト/15分
});
app.use(limiter);

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }
}));

// Flash メッセージ
app.use(flash());

// データベース初期化
const db = createDatabase();
global.db = db; // プロセッサーからアクセス用

// ジョブキュー初期化
const queue = createQueue();

// リクエストコンテキストにDB・キューを追加
app.use((req, res, next) => {
  req.db = db;
  req.queue = queue;
  next();
});

// 静的ファイル配信
app.use('/admin', express.static('public'));
app.use('/liff', express.static('public/liff'));

// ファイル配信（イベント画像等）
app.use('/files', express.static('files'));

// ルーティング
app.use('/api/admin', adminRoutes);
app.use('/api/liff', liffRoutes);
app.use('/api/line', lineRoutes);


// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// エラーハンドリング
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'Internal server error'
  });
});

// 404ハンドリング
app.use((req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`RC LINE API Server running on port ${PORT}`);
  console.log('Routes configured:');
  console.log('- /api/admin');
  console.log('- /api/liff');
  console.log('- /api/line');
});