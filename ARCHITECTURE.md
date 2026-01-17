# Architecture

## Frontend (GitHub Pages)
- Pure static PWA (Android-first)
- Entry: `index.html` → `main.js` → `app.js`
- Data: `localStorage` via `lib/store.js`
- Voice dictation: Web Speech API (where available)

## WhatsApp Bridge (optional, Dad setup once)
Static sites cannot receive WhatsApp messages. When enabled:
- WhatsApp → webhook (Cloudflare Worker) → `feed` endpoint
- Rosie app polls the feed and auto-files messages locally
- Rosie can ask the bridge to send WhatsApp nudges/reminders to parents/staff

No secrets are stored in the browser besides the **Bridge token** (a long random string).
WhatsApp API credentials live only in the Worker environment.

## Data model (summary)
- `family[]`
- `inbox[]` (WhatsApp + voice note intake)
- `calendar.events[]`
- `tasks[]`
- `groceries.items[]`
