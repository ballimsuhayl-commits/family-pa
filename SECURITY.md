# SECURITY

## CSP / GitHub Pages safety
This app:
- Uses **no** `eval()` / `new Function()`
- Uses **no** inline `<script>` blocks
- Uses only static assets

## Data
Default: stored locally in `localStorage`.
- Anyone with access to the device/browser profile can read it.
- Use **Export JSON** for backups.

## Gemini API keys
If you enable Gemini prototype mode, the key is stored in `localStorage` and can be extracted from the browser.
This is **not secure** for production.
Use a server-side proxy / Firebase AI Logic for production.

## Dependencies
No external JS libraries are loaded from CDNs.
