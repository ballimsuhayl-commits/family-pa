# Rosie – Family Assistant (GitHub Pages, zero-build)

This repo is designed to **work on GitHub Pages without any build step**.

✅ No React build  
✅ No `src/main.tsx` on Pages  
✅ No `eval()` / `new Function()`  
✅ No inline `<script>`  
✅ Mobile-first UI

## Deploy (GitHub Pages)
1. Push this repo to GitHub.
2. Repo → **Settings → Pages**
3. **Source:** Deploy from a branch
4. **Branch:** `main` (or `master`) and folder `/(root)`

Open your Pages URL (example): `https://<user>.github.io/<repo>/`

## Local run
Just open `index.html` in a browser, or use a tiny static server:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173/`

## Notes
- Data is stored in `localStorage` (per device).
- Admins (Nasima & Suhayl) can add/remove members in Settings.


See `docs/` for more.
