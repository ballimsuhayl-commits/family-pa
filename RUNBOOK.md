# RUNBOOK

## Common issues

### Blank screen / main.tsx 404
This should never happen with this repo. Confirm `index.html` contains:
`<script type="module" src="./main.js"></script>`

### Voice not working
- Ensure browser supports SpeechRecognition (Chrome/Edge).
- Allow microphone permissions.
- If unsupported: type into the “Tell Rosie” box.

### Importing .ics
Use Calendar tab → Import.
If assignments are wrong, adjust rules in Settings (JSON).

## Backup / restore
Settings → Export JSON
Settings → Import JSON


## GitHub Pages: blank page / 404 fixes
If you ever see requests for `/src/app.js` or `/src/icons.js` returning 404, this repo ships `app.js` + `icons.js` at the site root and `main.js` imports those. The included workflow `sync-gh-pages.yml` also publishes the repo root to the `gh-pages` branch on every push to `main`.
