# Rosie – Family Assistant (ITER6 Voice-First)

Rosie reduces mental load: **speak once**, Rosie sorts it into calendar, tasks, groceries, and reminders.

## Key UX rule
Nasima should do as little as possible. **Voice-first** capture does the filing.

## Features
- Mobile-first UI (bottom nav + big tap targets)
- Voice capture via Web Speech API (Chrome mobile best)
- Auto-filing: groceries / tasks / events / status
- Clash detection
- Offline-first (localStorage)

## Run locally
```bash
npm ci
npm run dev
```

## Deploy to GitHub Pages (project site: /family-pa/)
1. Push to `main`
2. GitHub Actions deploys build output to `gh-pages`
3. Repo Settings → Pages: source `gh-pages` /(root)

## Notes on voice
Web Speech API availability varies by browser. If voice isn't supported, Rosie falls back to text input.
