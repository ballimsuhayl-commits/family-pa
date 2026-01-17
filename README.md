# Rosie (Family PA)

## What this ZIP is
A full, wired, production-ready setup for:
- GitHub Pages (frontend) via GitHub Actions (builds Vite -> dist)
- Firebase (Auth + Firestore Rules + Cloud Functions)
- Gemini calls are server-side only (Cloud Functions secret)

## Go Live — Checklist

### 1) GitHub Pages (frontend)
1. Push this repo to GitHub (main branch).
2. Repo Settings -> Pages
   - Source: **GitHub Actions**
3. Actions tab -> wait for "Deploy GitHub Pages" to turn green.
4. Open your Pages URL. You should see Rosie.

### 2) Firebase Console (one-time)
- Authentication -> Sign-in method -> enable **Email/Password**.

### 3) Deploy backend (Functions + Firestore Rules)
Prereq: Firebase CLI logged in to the correct Google account.
Commands:
```bash
npm install
npm install --prefix functions
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions,firestore:rules,firestore:indexes
```

### 4) In the app (first time)
- Open Rosie -> Settings
- Paste Firebase web config JSON (public)
- Create/sign-in Nasima account -> Claim Admin
- Create/sign-in Suhayl account -> Claim Admin (2nd slot)

## Notes
- Two admin slots max, enforced by Cloud Functions + Firestore rules.
- Voice: uses device Text-to-Speech. If a female voice exists it will be preferred.
