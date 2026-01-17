# Rosie — Full Stack (Static GitHub Pages + Firebase)

## Why this version
- GitHub Pages is static hosting.
- This frontend is **pure static**: `index.html -> main.js`, so there is **no /src 404** and no build step.
- UI includes the robot mascot again and a more polished layout.

## Frontend Go-Live (GitHub Online)
1. Upload all files in this repo to your GitHub repository root (replace existing).
2. GitHub -> Settings -> Pages:
   - Source: GitHub Actions (recommended) OR Deploy from branch (root)
3. Open: https://<user>.github.io/<repo>/

## Backend Go-Live (Firebase)
1. Firebase Console -> Authentication -> enable Email/Password.
2. Deploy:
```bash
npm i -g firebase-tools
firebase login
firebase use nasima-family-pa
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions,firestore:rules,firestore:indexes
```

## In the app
- Settings -> paste Firebase web config JSON
- Create/sign in Nasima + Suhayl
- Settings -> Admin -> Claim Admin Slot (2 total)

## Icon 404 sanity check
If you see `icons/icon.svg 404`, verify the repo contains `icons/icon.svg` and that this URL loads:
`https://<user>.github.io/<repo>/icons/icon.svg`
