# Rosie – Family Assistant (GitHub Pages)

Rosie is a mobile-first family assistant designed to reduce admin “mental load”:
- voice-first capture (“Tell Rosie”)
- auto-sorts into Calendar / Tasks (Lisa/Jabu) / Groceries / Status
- clash detection + early reminders
- static hosting compatible (GitHub Pages)

## Quick start (local)
Requirements: Node 20+

```bash
npm ci
npm run dev
```

## Deploy to GitHub Pages
1. Push to `main`
2. Repo → Settings → Pages → **Source: GitHub Actions**
3. The workflow builds and deploys automatically.

## Voice features
- **Live speech-to-text** uses the browser Web Speech API (best on Chrome/Android).
- **Voice notes** are recorded with `MediaRecorder` and stored locally (IndexedDB).
- Optional: hook up a secure transcription gateway (see `docs/RUNBOOK.md`).

## Data storage
Default: local-first (LocalStorage + IndexedDB). Optional shared sync can be added later (e.g., Firestore).

## Scripts
- `npm run dev` – dev server
- `npm run build` – production build
- `npm run preview` – preview build
- `npm run lint` – lint
- `npm run test` – unit tests

