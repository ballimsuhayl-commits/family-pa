# Rosie — Full Stack ZIP (GitHub Pages + Firebase)

This repo is designed for **GitHub Online deployment**:
- Frontend is **pure static** (no Vite build needed).
- Fixes 404 for /src/main.jsx permanently.
- Works with GitHub Pages "Deploy from branch" OR GitHub Actions.

## Go Live (Frontend)
1) Replace your repo contents with the contents of this ZIP.
2) GitHub -> Settings -> Pages:
   - Source: Deploy from branch (main / root) OR GitHub Actions
3) Open your GitHub Pages URL.

## Go Live (Backend)
1) Firebase Console -> Authentication -> enable Email/Password.
2) Deploy:
```bash
npm i -g firebase-tools
firebase login
firebase use nasima-family-pa
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions,firestore:rules,firestore:indexes
```

## In the App
- Settings -> paste Firebase web config JSON
- Create/sign in Nasima + Suhayl -> Claim Admin Slot (2 total)
