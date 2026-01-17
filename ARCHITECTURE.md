# ARCHITECTURE

## Constraints
- Static hosting on GitHub Pages only.
- No runtime code that requires `eval` or inline scripts.
- All logic runs in-browser.

## Frontend stack
- Vite + React + TypeScript
- Local persistence: `localStorage` (single key, versioned)
- Accessible, keyboard-friendly UI (focus-visible rings, ARIA labels)

## Domain
- `Member`: `{ id, name, role }`
- `MemberStatus`: `{ key, updatedAt, note? }`
- `AppState`: `{ members[], statuses{} }`
- Admins are **data-driven** via `role: "admin"`.

## Security posture (baseline)
- No secrets stored in repo.
- No external script imports (reduces supply-chain/CSP issues).
- GitHub Actions uses least-privilege permissions.

## Future backend (optional)
If you later move beyond per-browser localStorage:
- Add a small API (e.g., serverless, or a container) to store shared status.
- Use OIDC login and store user identity -> member mapping.
- Keep the GitHub Pages frontend as-is; only swap storage layer.
