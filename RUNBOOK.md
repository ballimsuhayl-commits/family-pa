# RUNBOOK

## Common fixes

### Blank page / 404 main.tsx
This repo does not ship TSX to the browser. If you see `/src/main.tsx` errors, GitHub Pages is not serving this repo root.
Fix: Settings → Pages → Source `main /(root)`.

### Notifications not firing
Mobile browsers often require:
- user gesture (tap Alerts)
- app open in foreground
- notifications enabled for the site

### Import shows no events
Some calendar exports omit `SUMMARY` fields for certain event types. Try a different export option or another `.ics`.

## Backup / restore
Settings → Export JSON, or import the JSON file.
