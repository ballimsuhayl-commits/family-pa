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
