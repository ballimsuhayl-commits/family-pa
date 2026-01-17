# Rosie – Family Assistant (family-pa)

A lightweight family assistant web app designed to run **entirely on GitHub Pages** (static hosting only).

## What this is
- A friendly, light-themed “family board” where each person can set a quick status
- Admins (Nasima & Suhayl) can see Rosie’s summary
- Family list is **data-driven** and members are **addable** (not hard-coded only)
- Uses `localStorage` (per-browser) for now; future backend can be added later

## Non-negotiables (GitHub Pages safe)
- No server-side rendering
- No inline scripts
- No `eval()` / `new Function()`
- Production bundle only

## One-click local run
```bash
npm install
npm run dev
```

## Build + preview
```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages (recommended)
1. Push to `main`
2. GitHub → Settings → Pages → Source: **GitHub Actions**
3. The workflow in `.github/workflows/deploy-pages.yml` builds and deploys.

## Data model
See `src/domain.ts`.

## License
MIT (see `LICENSE`).

## Deploy (GitHub Pages)
1. Push to `main`.
2. GitHub → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Wait for the **Deploy to GitHub Pages** workflow to finish, then open the Pages URL.

