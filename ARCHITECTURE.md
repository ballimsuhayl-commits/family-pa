# ARCHITECTURE

## Goal
Minimize user effort: Nasima speaks, Rosie files.

## Frontend (Static)
- `index.html` loads `main.js` (ES modules) and `styles.css`
- Hash-router (`#/calendar`, etc.) to work on GitHub Pages
- State: `localStorage` (single JSON document)

## Key modules
- `src/app.js`
  - data model + storage
  - `.ics` parsing
  - voice parsing (routing into groceries/tasks/calendar/status)
- `main.js`
  - UI rendering (DOM)
  - voice dictation + audio note capture
  - reminder tick (every minute)

## Why no React/Vite here
GitHub Pages errors occurred because it served `index.html` that referenced `/src/main.tsx`. This stack avoids that entire class of deployment failures.
