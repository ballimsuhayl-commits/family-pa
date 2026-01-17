# SECURITY

## Threat model (practical)
This is a static browser app. Primary risks:
- Supply-chain risk from dependencies
- XSS via unsafe HTML injection
- Data leakage via sharing a device/browser profile

## Controls in place
- No `dangerouslySetInnerHTML`
- No inline scripts
- No external script CDNs
- Minimal dependencies
- GitHub Actions least privilege permissions for Pages deploy

## Recommended next hardening steps
- Enable Dependabot
- Add CodeQL workflow
- Pin Node version in `.nvmrc` (optional)
- Add a simple CSP via a static `headers` solution (GitHub Pages cannot set headers directly; would require a CDN like Cloudflare if desired)

## Privacy note
This version stores data in `localStorage` per browser only.
Do not treat it as private or shared across devices.
