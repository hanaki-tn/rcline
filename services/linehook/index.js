import express from 'express';
import crypto from 'crypto';

const {
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,
  N8N_REGISTER_WEBHOOK_URL,
  PORT = 3000,
  DEV_ALLOW_INSECURE = '0',  // for local testing
  FETCH_TIMEOUT_MS = '4000',
} = process.env;

if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN || !N8N_REGISTER_WEBHOOK_URL) {
  console.error('Missing env: LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / N8N_REGISTER_WEBHOOK_URL');
  process.exit(1);
}

const app = express();
// keep raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

function verifyLineSignature(req) {
  if (DEV_ALLOW_INSECURE === '1') return true; // dev mode
  const signature = req.get('x-line-signature');
  if (!signature || !req.rawBody) return false;
  const hmac = crypto.createHmac('sha256', LINE_CHANNEL_SECRET);
  hmac.update(req.rawBody);
  const expected = hmac.digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url, opts = {}, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, ...opts });
  } finally {
    clearTimeout(id);
  }
}

app.post('/linehook/register_collect', async (req, res) => {
  if (!verifyLineSignature(req)) {
    return res.sendStatus(403);
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  // Do not reply: OA greeting message will be shown to users
  res.status(200).end();

  for (const ev of events) {
    if (ev.type !== 'follow' || ev?.source?.type !== 'user') continue;
    const userId = ev.source.userId;
    if (!userId) continue;

    let displayName = '';
    try {
      const r = await fetchWithTimeout(
        `https://api.line.me/v2/bot/profile/${userId}`,
        { headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } },
        Number(FETCH_TIMEOUT_MS)
      );
      if (r.ok) {
        const js = await r.json();
        displayName = js.displayName ?? '';
      } else {
        console.warn('Get profile non-200:', r.status);
      }
    } catch (e) {
      console.warn('Get profile failed:', e.message);
    }

    const payload = {
      user_id: userId,
      name_display: displayName,
      name_input: displayName, // same at follow timing
    };

    try {
      const r = await fetchWithTimeout(
        N8N_REGISTER_WEBHOOK_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
        Number(FETCH_TIMEOUT_MS)
      );
      if (!r.ok) console.error('Post to n8n non-200:', r.status);
    } catch (e) {
      console.error('Post to n8n failed:', e.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`linehook listening on :${PORT}`);
});
