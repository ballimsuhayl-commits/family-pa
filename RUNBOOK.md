# Runbook

## Smoke test
```bash
npm ci
npm run lint
npm run test
npm run build
npm run preview
```

## GitHub Pages blank page troubleshooting
If you see 404 for `src/main.tsx` on the live site:
- You are serving source instead of built `dist`.
- Ensure Pages source is **gh-pages** branch.
- Ensure the GitHub Action ran successfully.

## Voice troubleshooting
- Use Chrome on Android for best SpeechRecognition support.
- If you get microphone permission errors, check site permissions.
