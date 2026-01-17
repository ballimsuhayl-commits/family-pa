# WhatsApp for Rosie (Home Pilot)

## Goal
Nasima should do *almost nothing* — she sends a WhatsApp text or voice note to Rosie, and Rosie auto-files it into:
- Calendar + reminders (and clash warnings)
- Tasks for Lisa/Jabu
- Groceries
- Inbox (always keeps a receipt)

## Important reality (why you saw blank pages before)
The Rosie web UI is a static site on GitHub Pages. It **cannot** receive WhatsApp messages directly.
WhatsApp delivers messages to a **public HTTPS webhook** (Rosie Brain), which then feeds the UI.

## Do we need 2 phones?
No.

### Recommended (best UX, least disruption)
- Nasima keeps her current WhatsApp number exactly as-is.
- Rosie gets a **house number** (a separate number) that runs the WhatsApp Business Platform (Cloud API).
- Nasima messages Rosie from her existing number on the same phone.

**This does NOT mean carrying two phones.**
It just means Rosie is a WhatsApp contact like any other.

### Using Nasima’s existing number as the Rosie bot number (possible but risky)
To run a WhatsApp bot/webhook on a number, it must be onboarded to WhatsApp Business Platform (Cloud API).
In many setups, migrating a number requires deleting the existing WhatsApp account for that number first.
Some newer onboarding modes for WhatsApp Business App users may allow onboarding without fully losing the app,
but eligibility and flow depend on Meta/WhatsApp settings and are not guaranteed.

## Cost expectations (home pilot)
Meta states:
- The first 1,000 conversations each month are free.
- Accessing the platform directly has no additional fee, but partners may charge.
Keep household usage low and you can typically stay in the free allowance.

## What’s included in this repo
- Frontend (GitHub Pages static) — already working baseline
- Optional “WhatsApp Inbox Bridge” in Settings (admin-only setup)
- Optional Cloudflare Worker “Rosie Brain” webhook (free-tier friendly)

## Home setup overview (admin tasks)
1) Create a WhatsApp Business Platform (Cloud API) app in Meta Business Manager.
2) Configure the webhook URL to point to the Worker route `/whatsapp/webhook`.
3) Set the verify token to match the Worker secret `VERIFY_TOKEN`.
4) Store inbound messages in Worker KV.
5) In Rosie Settings, paste the Worker public URL (read endpoint) to sync new items automatically.

See `docs/WHATSAPP_WORKER_SETUP.md` for the exact steps.
