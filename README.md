# Rosie – Family Assistant (Android-first, GitHub Pages safe (ITER11: role routing + WhatsApp reminders))

Rosie reduces the noise of family life:
- auto-files WhatsApp messages & voice notes into the right place
- prevents schedule clashes
- nudges Lisa/Jabu about chores
- keeps both parents aligned on the day

## Deploy (GitHub Pages)
This repo is static and **Pages-safe**:
- `index.html` loads `./main.js` (never `/src/*`)
- no inline scripts
- no `eval`

**Recommended Pages config**
- Settings → Pages → Deploy from branch
- Branch: `main`
- Folder: `/(root)`

## Android install (PWA)
Open the site in Chrome on Android → add to Home Screen (Rosie will also show an install card when available).

## WhatsApp Bridge (optional)
To accept WhatsApp messages and send reminders/instructions, connect the **WhatsApp Bridge**:
- See `docs/WHATSAPP_HOME_SETUP.md`
- Paste Bridge URL + token into Rosie → Settings

> Mum does not do setup steps. Suhayl does it once.

## Local development
Open `index.html` using any static server (recommended). For example:
- VS Code “Live Server” extension
- or `python -m http.server 8000`

Then open `http://localhost:8000/#/home`
