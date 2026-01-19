# Rosie — Family Assistant (Blob-Toon, No-404 Build) — r41

This repo keeps all original functionality and wiring, while eliminating the GitHub Pages console errors.

## Fixes
- No `/assets/rosie.png` 404 (Rosie embedded)
- No manifest icon warning (icons embedded)
- No SW `cache.addAll()` failure (safe caching)

## Deploy
1. Upload this ZIP contents to the repo root on GitHub (commit to `main`)
2. GitHub → Settings → Pages → Build and deployment → **GitHub Actions**
3. Open your Pages URL.

## If you still see old errors
Open the app → Settings → Backup → **Reset cache & reload**
