# Rosie Brain (Cloudflare Worker) — WhatsApp Webhook + Inbox API

This Worker receives WhatsApp Cloud API webhooks and exposes a small, authenticated inbox API that the
Rosie GitHub Pages UI can poll.

## What it does
- GET `/whatsapp/webhook` — verification (hub.challenge)
- POST `/whatsapp/webhook` — receive messages, store into KV
- GET `/api/inbox` — returns stored messages (requires Bearer token)
- GET `/health` — health check

## Free-tier friendliness
- Cloudflare Workers (free tier) + KV (free tier) is usually enough for a home pilot.

## Security model
- The UI uses a **read token** stored locally in the browser (Settings).
- The Worker enforces:
  - Bearer token for `/api/inbox`
  - Optional allowed origin list for CORS

## Setup (high level)
1) Install Wrangler and login:
   - `npm i -g wrangler`
   - `wrangler login`
2) Create KV namespace:
   - `wrangler kv namespace create ROSIE_KV`
   - Copy the id into `wrangler.toml`
3) Set secrets:
   - `wrangler secret put VERIFY_TOKEN`
   - `wrangler secret put READ_TOKEN`
4) Deploy:
   - `wrangler deploy`

## WhatsApp Cloud API config (Meta dashboard)
- Callback URL: `https://<your-worker>.workers.dev/whatsapp/webhook`
- Verify token: must match `VERIFY_TOKEN`
- Subscribe to messages webhook

## Inbox API
- `GET /api/inbox?since=<unix_ms>`
Headers:
- `Authorization: Bearer <READ_TOKEN>`

Response:
```json
{ "items": [ { "id":"...", "from":"+44...", "text":"...", "ts": 1730000000000, "source":"whatsapp" } ] }
```
