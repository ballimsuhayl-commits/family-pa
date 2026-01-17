# ARCHITECTURE

## Goals
- Mobile-first, calm UI to reduce overwhelm
- Works on GitHub Pages as a static site (no server-rendering, no runtime TSX)
- Data-driven family model (members are editable)
- Privacy-first: data stored locally on the device by default

## Components
- `index.html` + `styles.css` + `main.js` (ES module)
- `sw.js` provides offline cache for core assets
- Storage: `localStorage` (`rosie.familyPa.v1`)

## Data model (high level)
- `family[]` members (admins are a flag, not hard-coded)
- `events[]` calendar items (imported or manual)
- `tasks[]` chores/to-dos with optional assignment + due date
- `groceries[]` shopping list
- `chat[]` recent Rosie chat messages

## AI Integration
Two modes:
1) Local Rosie (default): rule-based summaries & guidance.
2) Gemini prototype mode: direct client-side API call (NOT recommended for production).

Production-grade AI integration should use a backend proxy (e.g., Firebase AI Logic) to keep credentials confidential.
