import express from 'express';

const router = express.Router();

// テスト用の簡単なエンドポイント
router.get('/test', (req, res) => {
  res.json({ message: 'LIFF routes working' });
});

export { router as liffRoutes };