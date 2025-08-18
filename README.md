# rcline (scaffold)

## What this includes
- Caddy reverse proxy with `/linehook/*` routed to the Node service
- `linehook` Node/Express service that handles LINE follow events and forwards `user_id`, `name_display`, `name_input` to n8n
- `.env.local` for local development

## Quick start (local)
```bash
cp .env.local .env
docker compose up -d --build
# test (dev signature disabled):
curl -X POST http://localhost/linehook/register_collect   -H 'Content-Type: application/json'   -d '{"events":[{"type":"follow","source":{"type":"user","userId":"Uxxxxxxxx"}}]}'
```

## Important env vars
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `N8N_REGISTER_WEBHOOK_URL` (e.g., https://awf.technavigation.jp/webhook/register_collect_dev)
- `DEV_ALLOW_INSECURE` (1 for local testing, 0 for prod)
