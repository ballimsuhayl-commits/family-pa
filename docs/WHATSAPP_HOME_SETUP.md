# WhatsApp Home Setup (private pilot)

Goal: family can message Rosie on WhatsApp; Rosie auto-files into the dashboard and sends reminders back.

## Important reality
A static GitHub Pages app cannot directly receive WhatsApp messages.
We connect WhatsApp to a small **Rosie Brain** webhook (Cloudflare Worker).

Mum does **zero** setup.
Dad does this once.

## Step 1 — Create a Rosie WhatsApp number
Use a spare SIM (can live in any spare device for verification only).
Nasima does NOT carry this phone.

## Step 2 — Create WhatsApp Business Platform (Cloud API)
In Meta developer tools:
- create app
- add WhatsApp product
- get:
  - permanent access token (or long-lived token)
  - phone_number_id
  - verify token you choose

## Step 3 — Deploy Rosie Brain Worker (free tier)
1. Create Cloudflare account (free)
2. Install Wrangler locally (Dad's laptop):
   - `cd brain/worker`
   - `npm i`
   - `npx wrangler login`
3. Create a KV namespace and bind it in `wrangler.toml`
4. Set secrets:
   - `npx wrangler secret put WHATSAPP_TOKEN`
   - `npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID`
   - `npx wrangler secret put WHATSAPP_VERIFY_TOKEN`
   - `npx wrangler secret put ROSIE_BRIDGE_TOKEN`
5. Optional notification lists:
   - `PARENTS_PHONES` (comma-separated E.164 digits)
   - `NOTIFY_PHONES`
   - `STAFF_PHONES`

Deploy:
- `npm run deploy`

## Step 4 — Connect the web app
In Rosie web app:
- Settings → WhatsApp Bridge
- Paste:
  - Bridge URL: `https://<your-worker>.workers.dev`
  - Bridge Token: value you set in `ROSIE_BRIDGE_TOKEN`

## Step 5 — Test
From Zaara's WhatsApp, message Rosie:
> Mum I have swimming at 2pm, forgot my goggles please bring them

Expected:
- Rosie web Inbox gets a new item (auto-filed)
- Calendar gets Swimming @ 2pm for Zaara
- Task created: Bring goggles (assigned to Nasima + Suhayl)
- Rosie can WhatsApp notify both parents (if NOTIFY_PHONES configured)
