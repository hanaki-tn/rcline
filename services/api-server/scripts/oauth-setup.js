import { google } from 'googleapis';
import http from 'http';
import url from 'url';
import fs from 'fs';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3001/oauth/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// スコープ設定
const scopes = [
  'https://www.googleapis.com/auth/spreadsheets.readonly'
];

// 認証URL生成
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('\n=== Google Sheets OAuth Setup ===');
console.log('1. 以下のURLにアクセスしてGoogle認証を完了してください：');
console.log('\n' + authUrl + '\n');

// ローカルサーバーでコールバック受信
const server = http.createServer(async (req, res) => {
  const queryObject = url.parse(req.url, true).query;
  
  if (req.url.startsWith('/oauth/callback')) {
    if (queryObject.error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>認証エラー</h1><p>${queryObject.error}</p>`);
      console.error('OAuth error:', queryObject.error);
      process.exit(1);
    }

    if (queryObject.code) {
      try {
        // 認証コードでトークン取得
        const { tokens } = await oauth2Client.getToken(queryObject.code);
        
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>認証成功！</h1><p>ターミナルに戻ってRefresh Tokenを確認してください。</p>');
        
        console.log('\n=== 認証成功 ===');
        console.log('Refresh Token:', tokens.refresh_token);
        console.log('\n.envファイルに以下を追加してください：');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
        
        server.close();
        process.exit(0);
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>トークン取得エラー</h1>');
        console.error('Token error:', error);
        process.exit(1);
      }
    }
  }
});

server.listen(3001, () => {
  console.log('2. 認証完了後、自動的にリダイレクトされます...');
});