# Runbook

## Health checks
- Open the site
- DevTools → Network: no `/src/*` requests
- Console: no errors

## If a blank page ever returns
1) View page source
2) Confirm `index.html` loads `./main.js` (not `/src/main.tsx`)
3) Confirm `main.js` imports `./app.js` (not `/family-pa/src/app.js`)
4) In Pages settings, ensure correct Branch/Folder (prefer `main /(root)`)

## WhatsApp Bridge troubleshooting
- In Settings, ensure Bridge URL ends without a trailing slash
- Ensure Bridge token matches
- Worker logs should show inbound messages

## Backup / restore
- Settings → Export/Import JSON
