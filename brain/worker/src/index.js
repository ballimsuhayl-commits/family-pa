/**
 * Rosie Brain (Cloudflare Worker)
 * - WhatsApp Cloud API webhook receiver
 * - Simple household feed for the Rosie web app
 * - Optional outbound WhatsApp nudges/reminders
 *
 * SECURITY:
 * - All /api/* endpoints require Authorization: Bearer ROSIE_BRIDGE_TOKEN
 * - WhatsApp webhook verification uses WHATSAPP_VERIFY_TOKEN
 *
 * STORAGE:
 * - Uses KV binding ROSIE_KV (recommended). If not configured, uses in-memory (dev only).
 */

const json = (obj, init={}) => new Response(JSON.stringify(obj), {
  headers: { 'Content-Type': 'application/json', ...init.headers },
  status: init.status || 200
});

const text = (t, init={}) => new Response(t, { status: init.status||200, headers: init.headers||{} });

function unauthorized() { return text('Unauthorized', { status: 401 }); }
function badRequest(msg='Bad Request') { return text(msg, { status: 400 }); }

function getBearer(req) {
  const h = req.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function kvList(env, prefix) {
  if (env.ROSIE_KV) {
    const list = await env.ROSIE_KV.list({ prefix });
    return list.keys.map(k => k.name);
  }
  return [];
}
async function kvGet(env, key) {
  if (env.ROSIE_KV) return await env.ROSIE_KV.get(key, { type: 'json' });
  return globalThis.__MEM__?.[key] || null;
}
async function kvPut(env, key, value) {
  if (env.ROSIE_KV) return await env.ROSIE_KV.put(key, JSON.stringify(value));
  globalThis.__MEM__ = globalThis.__MEM__ || {};
  globalThis.__MEM__[key] = value;
}
async function kvDel(env, key) {
  if (env.ROSIE_KV) return await env.ROSIE_KV.delete(key);
  if (globalThis.__MEM__) delete globalThis.__MEM__[key];
}

function serverTime() { return new Date().toISOString(); }

function normalizePhone(p) {
  return String(p||'').replace(/[^0-9]/g,'');
}

async function sendWhatsApp(env, to, body) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok:false, error:'WhatsApp credentials not configured' };
  }
  const url = `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body }
  };
  const res = await fetch(url, {
    method:'POST',
    headers: {
      'Content-Type':'application/json',
      'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) return { ok:false, error: data?.error?.message || 'send failed', data };
  return { ok:true, data };
}

function extractWhatsAppText(payload) {
  // Cloud API webhook payload format
  // We only handle text messages here (voice notes can be added later)
  try {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages?.length) return null;
    const msg = messages[0];
    const from = msg.from;
    const text = msg.text?.body || '';
    const id = msg.id || (`wa_${crypto.randomUUID()}`);
    return { id, from, text };
  } catch {
    return null;
  }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // Health
    if (url.pathname === '/health') {
      return json({ ok:true, time: serverTime() });
    }

    // WhatsApp verification
    if (url.pathname === '/whatsapp/webhook' && req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token && token === env.WHATSAPP_VERIFY_TOKEN) {
        return text(challenge || '');
      }
      return badRequest('Verification failed');
    }

    // WhatsApp inbound
    if (url.pathname === '/whatsapp/webhook' && req.method === 'POST') {
      const payload = await req.json().catch(()=>null);
      if (!payload) return badRequest('Invalid JSON');
      const w = extractWhatsAppText(payload);
      if (!w) return json({ ok:true }); // ignore non-text for now

      const msg = {
        id: w.id,
        type: 'whatsapp',
        from: w.from,
        receivedAt: serverTime(),
        text: w.text
      };

      await kvPut(env, `inbox:${msg.id}`, msg);
      // Also keep an ordered index
      await kvPut(env, `idx:${msg.receivedAt}:${msg.id}`, { id: msg.id });

      // OPTIONAL: Auto notify parents (if allowlist envs provided)
      const parents = (env.PARENTS_PHONES || '').split(',').map(s=>normalizePhone(s.trim())).filter(Boolean);
      if (parents.length) {
        const note = `Rosie received: "${msg.text}"`;
        ctx.waitUntil(Promise.all(parents.map(p => sendWhatsApp(env, p, note))));
      }

      return json({ ok:true });
    }

    // API auth
    if (url.pathname.startsWith('/api/')) {
      const token = getBearer(req);
      if (!token || token !== env.ROSIE_BRIDGE_TOKEN) return unauthorized();
    }

    // Feed for app polling
    if (url.pathname === '/api/feed' && req.method === 'GET') {
      const since = url.searchParams.get('since') || '';
      // naive list: return latest 50 items newer than since
      const keys = await kvList(env, 'idx:');
      const sorted = keys.sort().reverse();
      const items = [];
      for (const k of sorted) {
        if (items.length >= 50) break;
        const parts = k.split(':'); // idx:<iso>:<id>
        const ts = parts[1];
        if (since && ts <= since) break;
        const id = parts.slice(2).join(':');
        const msg = await kvGet(env, `inbox:${id}`);
        if (msg) items.push(msg);
      }
      return json({ serverTime: serverTime(), items });
    }

    // File receipt (from app) → notify others on WhatsApp
    if (url.pathname === '/api/file-receipt' && req.method === 'POST') {
      const body = await req.json().catch(()=>null);
      const inboxItem = body?.inboxItem;
      if (!inboxItem?.text) return badRequest('Missing inboxItem');

      // notify configured household recipients
      const notify = (env.NOTIFY_PHONES || '').split(',').map(s=>normalizePhone(s.trim())).filter(Boolean);
      if (notify.length) {
        const msg = `Rosie filed: ${String(inboxItem.from||'Someone')}: ${String(inboxItem.text).slice(0,400)}`;
        const results = await Promise.all(notify.map(p => sendWhatsApp(env, p, msg)));
        return json({ ok:true, results });
      }
      return json({ ok:true, note:'No NOTIFY_PHONES configured' });
    }

    // Nudge task
    if (url.pathname === '/api/nudge-task' && req.method === 'POST') {
      const body = await req.json().catch(()=>null);
      const task = body?.task;
      if (!task?.title) return badRequest('Missing task');

      // In a real setup map assigneeIds to phones; for pilot, send to STAFF_PHONES
      const staff = (env.STAFF_PHONES || '').split(',').map(s=>normalizePhone(s.trim())).filter(Boolean);
      if (!staff.length) return json({ ok:true, note:'No STAFF_PHONES configured' });

      const msg = `Rosie reminder: ${task.title}${task.dueAt ? ` (due ${task.dueAt})` : ''}`;
      const results = await Promise.all(staff.map(p => sendWhatsApp(env, p, msg)));
      return json({ ok:true, results });
    }

    // Cron reminders (placeholder)
    if (url.pathname === '/__scheduled' && req.method === 'POST') {
      return json({ ok:true });
    }

    return text('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Placeholder: iterate reminders in KV and send WhatsApp messages.
    // Kept intentionally minimal for home pilot.
  }
};
