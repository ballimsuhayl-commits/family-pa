# Rosie Brain (Cloudflare Worker)

This Worker is the server-side bridge for WhatsApp inbound/outbound, delivery status tracking,
per-household routing, and KV backup/restore.

## Quick start
```bash
npm i
npx wrangler login
npx wrangler kv namespace create INBOX_KV
# paste KV id into wrangler.toml
npx wrangler deploy
```

## Required environment variables
Set these in Cloudflare (Dashboard → Worker → Settings → Variables/Secrets):

- `VERIFY_TOKEN` (string) — WhatsApp webhook verification token
- `BRIDGE_SHARED_SECRET` (string, secret) — HMAC secret for signing bearer tokens
- `PAIRING_CODE` (string) — default 6-digit pairing code (can be rotated per household)
- `ALLOWED_ORIGINS` (string) — comma-separated allowed origins (e.g. `https://<user>.github.io`)

### Per-household routing
- `DEFAULT_GID` (string) — default household id (e.g. `family`)
- `HOUSEHOLD_MAP_JSON` (string) — JSON mapping WhatsApp `phone_number_id` → `gid`
  Example:
  ```json
  { "1234567890": "family", "999999999": "granny" }
  ```

### WhatsApp outbound (optional)
- `WA_ACCESS_TOKEN` (secret)
- `WA_PHONE_NUMBER_ID` (string)

## KV backup/restore
- `GET /api/backup/export?gid=family`
- `POST /api/backup/import?gid=family` body: `{ "items":[{"key":"...","value":"..."}] }`

## Delivery status tracking
- WhatsApp sends `statuses` via webhook. Worker stores status by message id.
- `GET /api/status/recent?gid=family`
