# Architecture

## Constraints
- Frontend must run on GitHub Pages (static hosting).
- No inline scripts, no eval/new Function.

## High-level
- React + Vite SPA (`apps/web`)
- Storage abstraction:
  - Local (IndexedDB via idb-keyval)
  - Optional Firestore sync (Firebase Web SDK)

## Data model
- `members`: family members
- `events`: calendar events (imported .ics or manual)
- `tasks`: chores / household tasks
- `groceries`: shopping list
- `settings`: reminder lead times, admin emails, auto-assign rules

## Sync
When Firebase config exists:
- App signs in (optional)
- Subscribes to Firestore collections for the selected familyId
- Writes are mirrored to local cache

Without Firebase:
- Reads/writes go to local storage only

## Admin controls
- Uses Firebase Auth Google sign-in
- Admin allowlist stored in `settings.adminEmails`
- If allowlist empty → first signed-in user can claim admin

## Proactive suggestions
- Detect overlapping events per member
- Flag overbooked days
- Suggest moving flexible tasks earlier/later or delegating
