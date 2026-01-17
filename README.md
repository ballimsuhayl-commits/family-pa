# Rosie – Family Assistant (GitHub Pages)

Rosie is a **mobile-first** family assistant that reduces the “mental load”:
- Calendar import (school `.ics`) + reminders
- Clash detection (overlapping events)
- Groceries list
- Tasks/chores (assign to Lisa & Jabu)
- “Ask Rosie” assistant (local mode + optional Gemini prototype mode)

## Run locally
Just open `index.html` in a browser, or use a tiny static server:

```bash
python -m http.server 5173
# then open http://localhost:5173
```

## Deploy to GitHub Pages
1. Repo → Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main** / folder **/(root)**

This repo is designed so Pages can serve it directly (no build needed).

## Calendar import
- Go to **Calendar**
- Upload a `.ics` file
- Imported events appear immediately
- Tap **Edit** to attach events to specific family members (helps clash detection)

## Reminders
Rosie can show upcoming reminders and (optionally) use browser notifications.
- Home → **Alerts** → allow notifications
- Reminder lead times are configurable in **Settings**

> Notifications only trigger while the app is open (browser limitation for many mobile browsers).

## Gemini (prototype mode)
You can enable Gemini in **Settings** and paste an API key.
**Important security note:** Google recommends you **do not expose API keys client-side** for production. Prefer a secure backend (e.g., Firebase AI Logic) for real deployments.
