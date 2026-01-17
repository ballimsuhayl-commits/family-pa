# Rosie – Family Assistant (ITER5)

Mobile‑first family organizer for calendar, reminders, chores, groceries, and clash prevention.

## What this iteration adds
- Multi-device **shared sync** (optional) via Firebase Firestore
- **Admin-only controls** via Firebase Auth (Google sign-in) + admin email allowlist stored in settings
- Proactive **clash prevention suggestions** (calendar overlaps, overbooked days)
- Keeps GitHub Pages compatibility: static build deployed to `gh-pages`

## Quick start (local)
```bash
npm ci
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

## GitHub Pages deploy
Push to `main`. GitHub Actions builds with base `/family-pa/` and deploys `dist/` to `gh-pages`.

## Enable shared sync (optional)
1. Create a Firebase project.
2. Enable **Firestore** and **Authentication → Google**.
3. Add a Web App in Firebase → copy config into GitHub repo secrets OR `.env.local`.
4. Set these env vars:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FAMILY_ID=default
```

Without Firebase env vars, Rosie runs fully offline using local storage.

## Admin bootstrapping
- First sign-in can claim admin if no admin emails exist yet.
- After that, only emails listed in **Settings → Admins** can access admin tools.

See docs in `docs/`.
