# RUNBOOK

## Local dev
```bash
npm install
npm run dev
```
Open the printed localhost URL.

## CI deploy
- Push to `main` triggers GitHub Actions.
- Artifacts are built into `dist/` and deployed to GitHub Pages.

## Common issues
### Blank page on Pages
- Confirm Pages is set to GitHub Actions.
- Confirm the base path is correct (handled automatically in workflow with `VITE_BASE=/<repo>/`).
- Check browser console for 404s on assets.

### Cache
Vite outputs hashed asset filenames. If you still see stale content:
- Hard refresh (Ctrl/Cmd+Shift+R)
- Re-open in an incognito window

## Reset data
Use the “Reset” button in the UI to clear `localStorage`.
