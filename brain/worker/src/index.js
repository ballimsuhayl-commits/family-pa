/**
 * Rosie Brain (Cloudflare Worker) — ITER11
 *
 * Goals:
 * - WhatsApp inbound → household feed
 * - Role-aware routing (kids → both parents; staff → admins; chores → staff)
 * - WhatsApp reminders (7d/3d/1d/2h default) without needing the app open
 * - Android-first PWA frontend remains static on GitHub Pages
 *
 * SECURITY:
 * - All /api/* endpoints require Authorization: Bearer ROSIE_BRIDGE_TOKEN
 * - WhatsApp webhook verification uses WHATSAPP_VERIFY_TOKEN
 * - Never embed WhatsApp tokens in the frontend; keep as Worker secrets.
 *
 * STORAGE:
 * - KV (ROSIE_KV) for feed + config + snapshot
 * - Durable Object (SCHEDULER) for reminder scheduling
 */

const json = (obj, init = {}) =>
  new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json", ...init.headers },
    ...init,
  });

const text = (s, init = {}) =>
  new Response(String(s), {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...init.headers },
    ...init,
  });

function serverTime() {
  return new Date().toISOString();
}

function normalizePhone(p) {
  return String(p || "").replace(/[^0-9]/g, "");
}

function bearerOk(req, env) {
  const token = env.ROSIE_BRIDGE_TOKEN;
  if (!token) return false;
  const h = req.headers.get("Authorization") || "";
  return h === `Bearer ${token}`;
}

// ---------- KV helpers ----------
async function kvGet(env, key) {
  if (env.ROSIE_KV) {
    const raw = await env.ROSIE_KV.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  globalThis.__MEM__ = globalThis.__MEM__ || {};
  return globalThis.__MEM__[key] || null;
}

async function kvPut(env, key, value) {
  if (env.ROSIE_KV) return await env.ROSIE_KV.put(key, JSON.stringify(value));
  globalThis.__MEM__ = globalThis.__MEM__ || {};
  globalThis.__MEM__[key] = value;
}

async function kvDel(env, key) {
  if (env.ROSIE_KV) return await env.ROSIE_KV.delete(key);
  globalThis.__MEM__ = globalThis.__MEM__ || {};
  delete globalThis.__MEM__[key];
}

async function kvList(env, prefix) {
  if (env.ROSIE_KV) {
    const out = [];
    let cursor = undefined;
    for (;;) {
      const res = await env.ROSIE_KV.list({ prefix, cursor, limit: 1000 });
      out.push(...res.keys.map((k) => k.name));
      if (res.list_complete) break;
      cursor = res.cursor;
    }
    return out;
  }
  globalThis.__MEM__ = globalThis.__MEM__ || {};
  return Object.keys(globalThis.__MEM__).filter((k) => k.startsWith(prefix));
}

// ---------- WhatsApp send ----------
async function sendWhatsApp(env, to, body) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: "WhatsApp credentials not configured" };
  }
  const url = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ---------- Household config ----------
function defaultLeadTimes() {
  return [
    { label: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "3d", ms: 3 * 24 * 60 * 60 * 1000 },
    { label: "1d", ms: 1 * 24 * 60 * 60 * 1000 },
    { label: "2h", ms: 2 * 60 * 60 * 1000 },
  ];
}

async function getHouseConfig(env) {
  const cfg = (await kvGet(env, "config:house")) || {};
  const family = Array.isArray(cfg.family) ? cfg.family : [];
  const reminders = cfg.reminders || {};
  if (!reminders.leadTimes) reminders.leadTimes = defaultLeadTimes();
  const routing = cfg.routing || {
    notifyAdminsOnChildMessages: true,
    notifyAdminsOnStaffUpdates: true,
    autoNudgeAssigneesForTasks: true,
    autoRemindParentsOnChildRequests: true,
  };

  // Fallback env allowlists (optional)
  const envParents = (env.PARENTS_PHONES || "")
    .split(",")
    .map((s) => normalizePhone(s.trim()))
    .filter(Boolean);
  const envStaff = (env.STAFF_PHONES || "")
    .split(",")
    .map((s) => normalizePhone(s.trim()))
    .filter(Boolean);

  const admins = family.filter((p) => p.admin && p.phone).map((p) => normalizePhone(p.phone));
  const staff = family
    .filter((p) => !p.admin && p.phone && /helper|garden|maintenance|lisa|jabu/i.test(p.role || p.name || ""))
    .map((p) => normalizePhone(p.phone));

  return {
    updatedAt: cfg.updatedAt || "",
    family,
    routing,
    reminders,
    digests: cfg.digests || { enabled: true, staffDailyDigest: true },
    fallback: { envParents, envStaff, admins, staff },
  };
}

function findPersonByPhone(cfg, phone) {
  const n = normalizePhone(phone);
  if (!n) return null;
  const p = (cfg.family || []).find((x) => normalizePhone(x.phone) === n);
  return p || null;
}

function adminPhones(cfg) {
  const a = cfg.fallback.admins || [];
  if (a.length) return a;
  const envParents = cfg.fallback.envParents || [];
  return envParents;
}

function staffPhones(cfg) {
  const s = cfg.fallback.staff || [];
  if (s.length) return s;
  return cfg.fallback.envStaff || [];
}

// ---------- Tiny NLP (mirrors client heuristics) ----------
function guessParents(cfg) {
  // Prefer explicit IDs if present
  const fam = cfg.family || [];
  const parents = fam
    .filter((p) => (p.id === "nasima" || p.id === "suhayl" || p.admin) && p.phone)
    .map((p) => normalizePhone(p.phone));
  const a = parents.filter(Boolean);
  return a.length ? a : adminPhones(cfg);
}

function parseWhen(text, now) {
  const lower = String(text || "").toLowerCase();
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!timeMatch) return null;

  let hour = parseInt(timeMatch[1], 10);
  const min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const ap = timeMatch[3];
  if (ap) {
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
  }

  let dayOffset = 0;
  if (/\btomorrow\b/.test(lower)) dayOffset = 1;
  if (/\btoday\b/.test(lower)) dayOffset = 0;

  const nextDay = lower.match(/\bnext\s+(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  const d = new Date(now);
  d.setSeconds(0, 0);

  if (nextDay) {
    const map = {
      sunday: 0, sun: 0,
      monday: 1, mon: 1,
      tuesday: 2, tue: 2,
      wednesday: 3, wed: 3,
      thursday: 4, thu: 4,
      friday: 5, fri: 5,
      saturday: 6, sat: 6,
    };
    const wanted = map[nextDay[1]];
    let delta = (wanted - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta);
  } else {
    d.setDate(d.getDate() + dayOffset);
  }

  d.setHours(hour, min, 0, 0);

  // If time already passed today and no explicit "today/tomorrow/next", assume tomorrow
  if (!/\btoday\b|\btomorrow\b|\bnext\b/.test(lower) && d.getTime() < now.getTime() - 60_000) {
    d.setDate(d.getDate() + 1);
  }

  return d.toISOString();
}

function parseAttachedBringTask(text, whenIso, parentIds = []) {
  const lower = String(text || "").toLowerCase();
  if (!/(forgot|forgotten).+\b(bring)\b/.test(lower)) return null;

  const thing = (String(text).match(/forgot\s+(my\s+)?([a-z ]{2,40})\b/i)?.[2] || "item").trim();
  const due = new Date(new Date(whenIso).getTime() - 90 * 60 * 1000).toISOString();
  return {
    title: `Bring ${thing}`,
    assigneeIds: parentIds,
    dueAt: due,
    notes: "From WhatsApp message",
  };
}

function parseInstruction(text, cfg) {
  const now = new Date();
  const t = String(text || "").trim();
  const lower = t.toLowerCase();

  // Grocery
  if (/\b(grocery|groceries|shopping|buy|get)\b/.test(lower)) {
    const items = t
      .replace(/^(grocery|groceries|shopping|buy|get)[:\s]*/i, "")
      .split(/,|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    return { kind: "grocery", items };
  }

  // Task: "tell Lisa to ..." / "ask Jabu to ..."
  const tell = lower.match(/\b(tell|ask|remind)\s+(lisa|jabu)\s+to\s+(.+)$/i);
  if (tell) {
    const who = tell[2];
    const title = tell[3].trim();
    return { kind: "task", title, assigneeRoleHint: who };
  }

  // Event if time present
  const when = parseWhen(t, now);
  if (when) {
    let title = t
      .replace(/\b(at|on)\b.+$/i, "")
      .replace(/\b(mum|dad|please|forgot|bring|remind me)\b/gi, "")
      .trim();
    title = title || "Event";

    const parents = guessParents(cfg);
    const attachedTask = parseAttachedBringTask(t, when, parents.map((p) => p)); // phone list for reminders
    return {
      kind: "event",
      title,
      startAt: when,
      endAt: new Date(new Date(when).getTime() + 60 * 60 * 1000).toISOString(),
      attachedTask,
    };
  }

  return { kind: "unknown", raw: t };
}

// ---------- Reminders ----------
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function padMs(ms) {
  return String(ms).padStart(13, "0");
}

function schedulerStub(env) {
  if (!env.SCHEDULER) return null;
  const id = env.SCHEDULER.idFromName("household");
  return env.SCHEDULER.get(id);
}

async function scheduleRemindersForEvent(env, cfg, { title, startAt }, recipientsPhones) {
  const leadTimes = cfg.reminders?.leadTimes || defaultLeadTimes();
  const startMs = new Date(startAt).getTime();
  const nowMs = Date.now();
  const stub = schedulerStub(env);
  if (!stub) return;

  for (const lt of leadTimes) {
    const atMs = startMs - lt.ms;
    if (atMs <= nowMs + 30_000) continue; // skip past/too soon
    for (const to of recipientsPhones) {
      const id = await sha256Hex(`event|${title}|${startAt}|${lt.label}|${to}`);
      const body = `⏰ Reminder (${lt.label}): ${title} at ${new Date(startAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}`;
      await stub.fetch("https://scheduler/schedule", {
        method: "POST",
        body: JSON.stringify({ id, atMs, to, body }),
      });
    }
  }
}

async function scheduleRemindersForTask(env, cfg, { title, dueAt }, recipientsPhones) {
  if (!dueAt) return;
  const leadTimes = cfg.reminders?.leadTimes || defaultLeadTimes();
  const dueMs = new Date(dueAt).getTime();
  const nowMs = Date.now();
  const stub = schedulerStub(env);
  if (!stub) return;

  for (const lt of leadTimes) {
    const atMs = dueMs - lt.ms;
    if (atMs <= nowMs + 30_000) continue;
    for (const to of recipientsPhones) {
      const id = await sha256Hex(`task|${title}|${dueAt}|${lt.label}|${to}`);
      const body = `✅ Task reminder (${lt.label}): ${title}`;
      await stub.fetch("https://scheduler/schedule", {
        method: "POST",
        body: JSON.stringify({ id, atMs, to, body }),
      });
    }
  }
}

async function scheduleFromSnapshot(env, cfg, snap) {
  if (!snap || !cfg.reminders?.enabled) return;

  const famPhonesById = new Map((snap.family || []).map((p) => [p.id, normalizePhone(p.phone)]));
  const admins = (snap.family || []).filter((p) => p.admin && p.phone).map((p) => normalizePhone(p.phone));
  const adminTargets = admins.length ? admins : adminPhones(cfg);

  // Events → remind admins (both parents), and also anyone in whoIds if they have phones
  for (const e of snap.events || []) {
    const recipients = new Set(adminTargets);
    for (const whoId of e.whoIds || []) {
      const ph = famPhonesById.get(whoId);
      if (ph) recipients.add(ph);
    }
    await scheduleRemindersForEvent(env, cfg, e, Array.from(recipients).filter(Boolean));
  }

  // Tasks → remind assignees; if none, remind admins
  for (const t of snap.tasks || []) {
    if ((t.status || "open") === "done") continue;
    const recipients = new Set();
    for (const aId of t.assigneeIds || []) {
      const ph = famPhonesById.get(aId);
      if (ph) recipients.add(ph);
    }
    if (!recipients.size) adminTargets.forEach((p) => recipients.add(p));
    await scheduleRemindersForTask(env, cfg, t, Array.from(recipients).filter(Boolean));
  }
}


async function sendStaffDigestFromSnapshot(env, cfg, snap) {
  const staffTargets = (snap.family || [])
    .filter((p) => !p.admin && p.phone && /helper|garden|maintenance|lisa|jabu/i.test(p.role || p.name || ""))
    .map((p) => ({ name: p.name, phone: normalizePhone(p.phone), id: p.id }));

  const tasks = (snap.tasks || []).filter((t) => (t.status || "open") !== "done");
  const now = Date.now();
  const in2d = now + 2 * 24 * 60 * 60 * 1000;

  const results = [];
  for (const st of staffTargets) {
    const mine = tasks.filter((t) => (t.assigneeIds || []).includes(st.id));
    const dueSoon = mine.filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= in2d).slice(0, 8);

    const lines = [];
    lines.push(`🌤️ Today’s tasks for ${st.name}`);
    if (!mine.length) lines.push("• (none)");
    for (const t of mine.slice(0, 8)) {
      const due = t.dueAt ? ` (due ${new Date(t.dueAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})` : "";
      lines.push(`• ${t.title}${due}`);
    }
    if (dueSoon.length) lines.push(`⚠️ Due soon: ${dueSoon.length}`);

    results.push(await sendWhatsApp(env, st.phone, lines.join("\n")));
  }
  return results;
}

// ---------- WhatsApp webhook parsing ----------
function parseWhatsAppInbound(payload) {
  try {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const from = normalizePhone(msg.from);
    const text = msg.text?.body || "";
    const id = msg.id || `wa_${crypto.randomUUID()}`;
    return { id, from, text };
  } catch {
    return null;
  }
}

// ---------- Durable Object Scheduler ----------
export class SchedulerDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/schedule" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = String(body.id || "");
      const atMs = Number(body.atMs || 0);
      const to = normalizePhone(body.to || "");
      const msgBody = String(body.body || "");
      if (!id || !atMs || !to || !msgBody) return json({ ok: false, error: "bad request" }, { status: 400 });

      // Dedup
      const seen = await this.state.storage.get(`d:${id}`);
      if (seen) return json({ ok: true, dedup: true });

      await this.state.storage.put(`d:${id}`, true);
      const key = `r:${padMs(atMs)}:${id}`;
      await this.state.storage.put(key, { id, atMs, to, body: msgBody });

      // Ensure alarm is set to earliest reminder
      const next = await this._peekNextMs();
      if (next) await this.state.storage.setAlarm(next);

      return json({ ok: true });
    }

    if (url.pathname === "/tick" && req.method === "POST") {
      await this._processDue();
      return json({ ok: true });
    }

    return text("Not found", { status: 404 });
  }

  async alarm() {
    await this._processDue();
  }

  async _peekNextMs() {
    const list = await this.state.storage.list({ prefix: "r:", limit: 1 });
    for (const [k] of list) {
      const ms = Number(k.split(":")[1]);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }

  async _processDue() {
    const now = Date.now();
    const list = await this.state.storage.list({ prefix: "r:" });
    let nextMs = null;

    for (const [k, v] of list) {
      const ms = Number(k.split(":")[1]);
      if (!Number.isFinite(ms)) {
        await this.state.storage.delete(k);
        continue;
      }
      if (ms <= now + 5000) {
        // Due
        await sendWhatsApp(this.env, v.to, v.body);
        await this.state.storage.delete(k);
      } else {
        nextMs = ms;
        break;
      }
    }

    if (nextMs) await this.state.storage.setAlarm(nextMs);
  }
}

// ---------- Main Worker ----------
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Health
    if (url.pathname === "/health") {
      return json({ ok: true, time: serverTime() });
    }

    // WhatsApp verification (GET)
    if (url.pathname === "/whatsapp/webhook" && req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
        return text(challenge || "", { status: 200 });
      }
      return text("Forbidden", { status: 403 });
    }

    // WhatsApp webhook (POST)
    if (url.pathname === "/whatsapp/webhook" && req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      const w = parseWhatsAppInbound(payload);
      if (!w) return json({ ok: true });

      const cfg = await getHouseConfig(env);
      const sender = findPersonByPhone(cfg, w.from);
      const fromLabel = sender?.name || w.from;

      const msg = {
        id: w.id,
        from: w.from,
        fromLabel,
        senderId: sender?.id || "",
        receivedAt: serverTime(),
        text: w.text || "",
      };

      await kvPut(env, `inbox:${msg.id}`, msg);
      await kvPut(env, `idx:${msg.receivedAt}:${msg.id}`, { id: msg.id });

      // Role-aware routing: kids → both parents
      if (cfg.routing?.notifyAdminsOnChildMessages) {
        const role = String(sender?.role || "").toLowerCase();
        const isKid = role.includes("daughter") || role.includes("son") || role.includes("kid") || sender?.id === "zaara" || sender?.id === "rayhaan";
        if (isKid) {
          const parents = guessParents(cfg);
          const note = `📩 ${sender?.name || "Child"}: "${msg.text}"`;
          ctx.waitUntil(Promise.all(parents.map((p) => sendWhatsApp(env, p, note))));
        }
      }

      // Parse + schedule reminders immediately (best effort)
      if (cfg.reminders?.enabled && msg.text) {
        const parsed = parseInstruction(msg.text, cfg);
        if (parsed.kind === "event") {
          const parents = guessParents(cfg);
          ctx.waitUntil(scheduleRemindersForEvent(env, cfg, parsed, parents));
          if (parsed.attachedTask) {
            ctx.waitUntil(scheduleRemindersForTask(env, cfg, parsed.attachedTask, parents));
          }
        }
        if (parsed.kind === "task") {
          // staff hint
          const staff = staffPhones(cfg);
          if (staff.length) ctx.waitUntil(scheduleRemindersForTask(env, cfg, { title: parsed.title, dueAt: parseWhen(msg.text, new Date()) }, staff));
        }
      }

      return json({ ok: true });
    }

    // API auth
    if (url.pathname.startsWith("/api/") && !bearerOk(req, env)) {
      return json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Store config pushed from app (family roster + rules)
    if (url.pathname === "/api/config" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const cfg = {
        updatedAt: serverTime(),
        family: Array.isArray(body.family) ? body.family : [],
        routing: body.routing || {},
        reminders: body.reminders || {},
        digests: body.digests || { enabled: true, staffDailyDigest: true },
      };
      await kvPut(env, "config:house", cfg);
      return json({ ok: true, updatedAt: cfg.updatedAt });
    }

    // Feed for app polling (WhatsApp + any future channels)
    if (url.pathname === "/api/feed" && req.method === "GET") {
      const since = url.searchParams.get("since") || "";
      const keys = await kvList(env, "idx:");
      const sorted = keys.sort().reverse();
      const items = [];
      for (const k of sorted) {
        if (items.length >= 50) break;
        const parts = k.split(":"); // idx:<iso>:<id>
        const ts = parts[1];
        if (since && ts <= since) break;
        const id = parts.slice(2).join(":");
        const msg = await kvGet(env, `inbox:${id}`);
        if (msg) items.push(msg);
      }

      return json({ ok: true, serverTime: serverTime(), items });
    }

    // Snapshot push (from admin phones) so Brain can schedule reminders/digests for tasks/events
    if (url.pathname === "/api/snapshot" && req.method === "POST") {
      const snap = await req.json().catch(() => ({}));
      await kvPut(env, "snapshot:latest", { ...snap, receivedAt: serverTime() });

      // Schedule reminders based on snapshot
      const cfg = await getHouseConfig(env);
      ctx.waitUntil(scheduleFromSnapshot(env, cfg, snap));

      return json({ ok: true });
    }

    // Manual nudge: send a task to its assignees (or fallback staff list)
    if (url.pathname === "/api/nudge-task" && req.method === "POST") {
      const cfg = await getHouseConfig(env);
      const body = await req.json().catch(() => ({}));
      const task = body.task || {};
      const fam = cfg.family || [];
      const toPhones = [];

      for (const id of task.assigneeIds || []) {
        const p = fam.find((x) => x.id === id);
        const ph = normalizePhone(p?.phone || "");
        if (ph) toPhones.push(ph);
      }
      if (!toPhones.length) toPhones.push(...staffPhones(cfg));

      const msg = `🧹 Rosie chore: ${task.title}${task.dueAt ? ` (due ${new Date(task.dueAt).toLocaleString()})` : ""}`;
      const results = await Promise.all(toPhones.filter(Boolean).map((p) => sendWhatsApp(env, p, msg)));
      return json({ ok: true, results });
    }

    // Send staff digest now (optional)
    if (url.pathname === "/api/send-digest" && req.method === "POST") {
      const cfg = await getHouseConfig(env);
      const snap = await kvGet(env, "snapshot:latest");
      if (!snap) return json({ ok: false, error: "no snapshot yet" }, { status: 409 });

      const results = await sendStaffDigestFromSnapshot(env, cfg, snap);
      return json({ ok: true, results });
    }

    return text("Not Found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Safety tick: process reminders even if an alarm was missed
    try {
      const stub = schedulerStub(env);
      if (stub) await stub.fetch("https://scheduler/tick", { method: "POST" });
    } catch {}

    // Optional daily staff digest (cron configured in wrangler.toml)
    // Guarded by config.digests.enabled + config.digests.staffDailyDigest.
    try {
      const cfg = await getHouseConfig(env);
      if (!cfg.digests?.enabled || !cfg.digests?.staffDailyDigest) return;
      const snap = await kvGet(env, "snapshot:latest");
      if (!snap) return;

      // Send digest once per day (naive idempotency)
      const today = new Date().toISOString().slice(0, 10);
      const last = await kvGet(env, "digest:last");
      if (last?.day === today) return;
      await kvPut(env, "digest:last", { day: today });

      await sendStaffDigestFromSnapshot(env, cfg, snap);
    } catch {}
  },
};
