# WhatsApp Routing + Reminders (ITER11)

Rosie is designed so **Nasima does as little as possible**.
WhatsApp is the input channel; Rosie auto-files and keeps both parents aligned.

This iteration adds:
- **Role-aware routing**: kids → both parents; staff → admins; chores → the right staff member
- **WhatsApp reminders** (7d / 3d / 1d / 2h by default) that arrive even if the app is closed

## How it works

### 1) WhatsApp inbound → Rosie Brain
WhatsApp Cloud API sends each incoming message to the Worker webhook:

- `POST /whatsapp/webhook` (Meta → Worker)
- Worker stores the message in KV and exposes it to the app via:
  - `GET /api/feed?since=...` (App → Worker)

### 2) App → Worker snapshot (automatic)
When the WhatsApp Bridge is configured **on an admin phone** (Nasima or Suhayl),
the web app automatically pushes a small state snapshot every ~60 seconds:

- `POST /api/snapshot` (App → Worker, authenticated)

This snapshot contains:
- family roster (ids, names, roles, phones)
- tasks (open/done + due times)
- calendar events (start/end times)

Rosie Brain uses the snapshot to:
- schedule WhatsApp reminders (Durable Object Scheduler)
- send digests (e.g., daily tasks to Lisa/Jabu)

> ✅ Nasima does **nothing** beyond using WhatsApp normally.

### 3) Reminders
For each upcoming event or due task, Rosie Brain schedules reminders at:
- 7 days, 3 days, 1 day, 2 hours before (defaults)

The schedule is stored in the Durable Object so it survives restarts.

## One-time admin setup (Suhayl)
1. Deploy the Worker (`brain/worker`) using Cloudflare Wrangler
2. Configure secrets:
   - `ROSIE_BRIDGE_TOKEN` (shared with the app)
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
3. In Rosie app → Settings:
   - set Bridge URL + token
   - enter phone numbers for family members
   - tap **Send roster + rules** once

After that: WhatsApp → Rosie → Dashboard + reminders.

## Troubleshooting
- If reminders aren't arriving:
  - ensure Worker has `SCHEDULER` durable object binding deployed
  - ensure `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` secrets are set
  - ensure an admin phone has opened Rosie recently (so snapshots are pushed)
