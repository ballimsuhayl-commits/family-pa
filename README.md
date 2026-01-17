# Rosie — Family Assistant (GitHub Pages Safe)

Rosie is a mobile-first family assistant designed to reduce mental load: auto-sort voice notes into calendar, chores, groceries, status, and warn early to prevent clashes.

## Runs on GitHub Pages (no blank screen)
This repo **does not ship TSX/JSX** and **does not require a build step**. GitHub Pages serves static files directly.

### Deploy
- GitHub → Settings → Pages
- Source: Deploy from a branch
- Branch: `main` / folder: `/(root)`

Open: `https://<user>.github.io/family-pa/`

## Voice
- Live dictation uses the browser SpeechRecognition API (Chrome/Edge supported).
- Voice note recording uses MediaRecorder (permission required).
- If a browser does not support voice, Rosie still works with typing.

## School calendar import
Import `.ics` and Rosie auto-fills the calendar and creates early reminders.

## Data
Stored locally in `localStorage` (export/import in Settings). This can be upgraded later to Firestore without changing the UX.

## Security
No inline scripts. No eval(). No new Function(). No external CDNs.


## WhatsApp (optional)
See `docs/WHATSAPP_HOME_SETUP.md`.
