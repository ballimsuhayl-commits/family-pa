# Architecture

## Constraints
- GitHub Pages hosting
- No inline scripts, CSP-safe
- Mobile-first UX
- Offline-first (no backend required)

## Modules
- `src/lib/storage.ts`: persistent state
- `src/lib/voice.ts`: Web Speech API + MediaRecorder helpers
- `src/lib/rosieNlu.ts`: lightweight offline command parsing
- `src/lib/rosieEngine.ts`: applies actions to state
- `src/ui/*`: React UI

## Data
Single JSON state in localStorage keyed by `rosie.state.v6`.
