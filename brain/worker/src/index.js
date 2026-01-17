/**
 * Rosie Brain — Cloudflare Worker
 *
 * Endpoints:
 *   GET  /health
 *   GET  /whatsapp/webhook   (verification)
 *   POST /whatsapp/webhook   (inbound messages)
 *   GET  /api/inbox          (authenticated inbox feed)
 *
 * Secrets (wrangler secret put):
 *   VERIFY_TOKEN
 *   READ_TOKEN
 */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const text = (data, status = 200, headers = {}) =>
  new Response(data, { status, headers });

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const isAllowed = allow.length === 0 ? false : allow.includes(origin);
  // If you want easiest home mode, set ALLOWED_ORIGINS to your GitHub Pages origin.
  return isAllowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      }
    : {};
}

function authOk(req, env) {
  const h = req.headers.get("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return token && env.READ_TOKEN && token === env.READ_TOKEN;
}

async function storeItem(env, item) {
  const key = `msg:${item.ts}:${item.id}`;
  await env.ROSIE_KV.put(key, JSON.stringify(item));
  // keep a rolling index pointer (best-effort)
  await env.ROSIE_KV.put("last_ts", String(item.ts));
}

async function listItems(env, sinceMs) {
  // KV list is prefix-based and paginated; for home scale this is fine.
  const res = await env.ROSIE_KV.list({ prefix: "msg:" });
  const items = [];
  for (const k of res.keys) {
    const raw = await env.ROSIE_KV.get(k.name);
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (!sinceMs || obj.ts > sinceMs) items.push(obj);
    } catch {}
  }
  items.sort((a, b) => a.ts - b.ts);
  return items;
}

function extractMessages(payload) {
  // WhatsApp Cloud API webhook payloads can include multiple entries/changes.
  // We extract text messages only in this minimal worker. Voice notes can be added next (download media).
  const out = [];
  try {
    const entries = payload.entry || [];
    for (const e of entries) {
      const changes = e.changes || [];
      for (const c of changes) {
        const v = c.value || {};
        const messages = v.messages || [];
        for (const m of messages) {
          const from = m.from ? `+${m.from}` : "";
          const ts = m.timestamp ? Number(m.timestamp) * 1000 : Date.now();
          const id = m.id || crypto.randomUUID();
          if (m.type === "text" && m.text && m.text.body) {
            out.push({ id, from, ts, text: m.text.body, source: "whatsapp" });
          } else if (m.type) {
            // store a placeholder for non-text
            out.push({ id, from, ts, text: `[${m.type} message received]`, source: "whatsapp" });
          }
        }
      }
    }
  } catch {}
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders(req, env) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "rosie-brain" }, 200, corsHeaders(req, env));
    }

    if (url.pathname === "/whatsapp/webhook" && req.method === "GET") {
      // Verification: hub.mode, hub.verify_token, hub.challenge
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token && env.VERIFY_TOKEN && token === env.VERIFY_TOKEN && challenge) {
        return text(challenge, 200);
      }
      return text("forbidden", 403);
    }

    if (url.pathname === "/whatsapp/webhook" && req.method === "POST") {
      const payload = await req.json().catch(() => ({}));
      const msgs = extractMessages(payload);
      for (const item of msgs) await storeItem(env, item);
      return json({ ok: true, received: msgs.length });
    }

    if (url.pathname === "/api/inbox" && req.method === "GET") {
      if (!authOk(req, env)) return json({ ok: false, error: "unauthorized" }, 401);
      const since = Number(url.searchParams.get("since") || "0") || 0;
      const items = await listItems(env, since);
      return json({ ok: true, items }, 200, corsHeaders(req, env));
    }

    return text("not found", 404);
  },
};
