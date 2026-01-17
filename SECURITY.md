# Security

## No secrets in client
Rosie can run without any secrets. If you enable Firebase, you still should treat the Firebase web config as public.

## Admin controls
- Admin access is controlled by a Firestore allowlist of email addresses.
- If allowlist is empty, the first signed-in user can claim admin.

## Firestore rules
Use the provided example rules in `firebase/firestore.rules` and tighten them for your family.

## CSP
- No inline script tags.
- No eval/new Function.

## Data safety
- Local data is stored in IndexedDB.
- Export/import supported (JSON) in Settings.
