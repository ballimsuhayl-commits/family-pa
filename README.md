# Rosie – Family Assistant (ITER13)

This iteration adds a **Calendar overview** with **2-week** and **Month** views.
Tap any day to see all activities with **who / what / where**.

## Deploy (GitHub Pages)
Settings → Pages → Deploy from branch → `main` → `/(root)`

## Baseline invariants (do not break)
- `index.html` loads `./main.js`
- runtime imports are `./app.js`, `./icons.js`, etc (no `/src/*`)

## Run locally
`python -m http.server 8080` then open http://localhost:8080
