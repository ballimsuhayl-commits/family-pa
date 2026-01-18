# Rosie Brain (Cloudflare Worker) — ITER15

This Worker connects WhatsApp Cloud API inbound messages to Rosie’s static GitHub Pages app.

## What it does (ITER15)
- Receives inbound WhatsApp messages via `/webhook`
- Stores them in Cloudflare KV (private)
- Provides a private API for the Rosie app:
  - `POST /api/pair` → exchange pairing code for a bearer token (Suhayl once)
  - `GET /api/inbox` → list inbound messages
  - `POST /api/file` → store “what Rosie did” (receipt + deltas) so both parents stay aligned
  - `GET /api/updates` → list filings to sync to the other phone

> ITER16 (outbound reminders) is **not** implemented yet.

## Setup (free tier)
1) **Create a Cloudflare account** and install Wrangler:
- `npm i`
- `npx wrangler login`

2) **Create KV namespace**
- `npx wrangler kv namespace create INBOX_KV`
- Copy the returned `id` into `wrangler.toml` under `kv_namespaces`.

3) **Set environment variables**
In Cloudflare Dashboard → Workers → Settings → Variables (or via Wrangler secrets):

Required:
- `VERIFY_TOKEN` (any random string; used during webhook verification)
- `PAIRING_CODE` (a simple code Suhayl will type once in Rosie Settings)
- `BRIDGE_SHARED_SECRET` (random 32+ chars)

Recommended:
- `META_APP_SECRET` (Meta App Secret; enables X-Hub-Signature-256 verification)
- `ALLOWED_ORIGINS` (comma-separated GitHub Pages origins, e.g. `https://<user>.github.io`)

4) **Deploy**
- `npm run deploy`

You’ll get a URL like:
- `https://rosie-brain.<your-subdomain>.workers.dev`

## WhatsApp Cloud API (Meta) wiring
In Meta App Dashboard:
- Add the **WhatsApp** product and connect a phone number.
- Configure Webhooks:
  - Callback URL: `https://<your-worker>/webhook`
  - Verify token: value of `VERIFY_TOKEN`
  - Subscribe to **messages**

## Rosie app pairing (Suhayl once)
On Suhayl’s phone:
- Rosie → Settings → WhatsApp Bridge
- Enter **Bridge URL** + **Pairing code**
- Tap **Pair & save token**
- Export a backup and import it on Nasima’s phone (so she does zero setup)

## Data retention
Messages and filings are stored in KV until you delete them. If you want automatic retention limits, add a scheduled cleanup later.
