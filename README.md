# Rosie – Family Assistant (ITER15)

Mobile-first, GitHub Pages safe family assistant.

## What’s new in ITER14
- **Command Center Home:** Next 14 days in one scroll (Today/Tomorrow included)
- **Lists:** Tasks + Groceries (quick add, one-tap done)
- **Urgent view:** clashes, urgent tasks, and “bring this” prep reminders (next 72h)
- **Calendar overview:** 2-week + Month views
- **Filters:** person / type (School/Home/Staff/Other) / location
- **School calendar import:** upload `.ics` and Rosie auto-fills the calendar

## Hosting (GitHub Pages)
Settings → Pages → Deploy from branch → `main` → `/(root)`

## Non-breakable invariants
- `index.html` loads `./main.js` (never `/src/main.tsx`)
- runtime modules are in repo root (`./app.js`, `./store.js`, etc.)
- no inline scripts, no eval



## WhatsApp Bridge (ITER15 inbound)
Rosie is still a static GitHub Pages app. WhatsApp inbound requires a separate server-side bridge.

- Worker code: `brain/worker/`
- Deploy on Cloudflare Workers (free tier)
- Pair once (Suhayl) inside Rosie Settings, then export/import backup so Nasima does zero setup.

See `brain/worker/README.md` for exact steps.

## Local run
- `python -m http.server 8080` then open `http://localhost:8080`

## Data
Stored in `localStorage` under `rosie.v14.state`. On first run it migrates from older keys automatically.
