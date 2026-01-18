# Rosie – Family Assistant (ITER22 UI/UX)

This repo is a **static GitHub Pages** app (root-only assets) plus an optional **Cloudflare Worker** bridge.

# Rosie – Family Assistant (ITER14)

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

## Local run
- `python -m http.server 8080` then open `http://localhost:8080`

## Data
Stored in `localStorage` under `rosie.v14.state`. On first run it migrates from older keys automatically.
