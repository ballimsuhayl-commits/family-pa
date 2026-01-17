# Runbook

## Common issues
### Blank page on GitHub Pages
Cause: wrong Pages source or wrong base path.
Fix:
- Pages must serve `gh-pages` branch (root).
- Ensure Actions workflow completes successfully.

### Still seeing requests like `/src/main.tsx`
That means Pages is serving source, not build output.
Fix: Settings → Pages → Source `Deploy from a branch` → `gh-pages` / root.

## Commands
- Dev: `npm run dev`
- Lint: `npm run lint`
- Tests: `npm run test`
- Build: `npm run build`
- Preview: `npm run preview`

## Firebase (optional)
- Enable Firestore + Auth Google
- Add env vars in GitHub Secrets (recommended) or `.env.local`

## Rollback
- Revert to previous successful commit; `gh-pages` will redeploy automatically.
