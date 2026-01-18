Static JS modules at repo root. Calendar page provides 2-week and month overview.


## ITER15
- Command Center home
- Urgent view
- ICS import via `ics.js`
- Calendar filters stored in `state.ui.calFilter`


## WhatsApp Bridge (ITER15)
The web app stays fully static (GitHub Pages). A separate Cloudflare Worker (`brain/worker/`) receives WhatsApp webhook events and exposes a small authenticated API to sync inbound messages and cross-device filings.
