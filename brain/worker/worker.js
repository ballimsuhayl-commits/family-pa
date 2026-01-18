// Rosie Brain — Cloudflare Worker (ITER15)
// Inbound WhatsApp webhook -> inbox storage, plus private API for the Rosie web app (GitHub Pages).
// Security: webhook verify token + optional X-Hub-Signature-256, plus HMAC-signed bearer token for app API.
//
// Bindings required (Wrangler):
// - INBOX_KV: KV namespace for message + filing storage
//
// Env vars required:
// - VERIFY_TOKEN: webhook verification token (Meta -> Webhooks)
// - PAIRING_CODE: code Suhayl uses once in the app to obtain an API token
// - BRIDGE_SHARED_SECRET: random 32+ char secret used to sign/verify API tokens
// - META_APP_SECRET: (optional but recommended) Meta App Secret, used to verify X-Hub-Signature-256
// - ALLOWED_ORIGINS: comma-separated allowed web origins for CORS (e.g. https://<user>.github.io)
// - MAX_LIST_LIMIT: (optional) default 50

const textEncoder = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

  // If no origin (e.g. curl), don't add CORS.
  if (!origin) return {};

  const allow = allowed.includes(origin) ? origin : '';
  if (!allow) return {}; // strict: no wildcard by default

  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function withCors(req, env, res) {
  const headers = corsHeaders(req, env);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

function b64urlEncode(bytes) {
  let str = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecodeToBytes(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(secret, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

async function verifyHmacSha256(secret, dataBytes, sigBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
}

function nowIso() {
  return new Date().toISOString();
}

function clampLimit(n, env) {
  const max = Math.max(1, Math.min(200, parseInt(env.MAX_LIST_LIMIT || '50', 10)));
  const v = parseInt(n || '', 10);
  if (!Number.isFinite(v) || v <= 0) return max;
  return Math.max(1, Math.min(200, v));
}

async function issueToken(env) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 365 * 24 * 60 * 60;
  const payload = { v: 1, iat, exp };
  const payloadB64 = b64urlEncode(textEncoder.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(env.BRIDGE_SHARED_SECRET, textEncoder.encode(payloadB64));
  const sigB64 = b64urlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

async function verifyToken(env, token) {
  if (!token) return { ok: false, reason: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'format' };
  const [payloadB64, sigB64] = parts;
  const sigBytes = b64urlDecodeToBytes(sigB64);
  const ok = await verifyHmacSha256(env.BRIDGE_SHARED_SECRET, textEncoder.encode(payloadB64), sigBytes);
  if (!ok) return { ok: false, reason: 'bad_sig' };
  let payload = null;
  try { payload = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(payloadB64))); } catch { }
  if (!payload?.exp) return { ok: false, reason: 'bad_payload' };
  if (Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

function bearer(req) {
  const h = req.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function verifyWebhookSignature(req, env, bodyBytes) {
  const header = req.headers.get('X-Hub-Signature-256') || '';
  // Header looks like: "sha256=<hex>"
  const m = header.match(/^sha256=([0-9a-f]+)$/i);
  if (!m) return { ok: false, reason: 'missing' };
  if (!env.META_APP_SECRET) return { ok: false, reason: 'no_secret' };

  const secret = env.META_APP_SECRET;
  const sig = await hmacSha256(secret, bodyBytes);
  const gotHex = m[1].toLowerCase();
  const calcHex = Array.from(sig).map(b => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  if (gotHex.length !== calcHex.length) return { ok: false, reason: 'len' };
  let diff = 0;
  for (let i = 0; i < gotHex.length; i++) diff |= (gotHex.charCodeAt(i) ^ calcHex.charCodeAt(i));
  return { ok: diff === 0, reason: diff === 0 ? 'ok' : 'mismatch' };
}

function extractWhatsAppMessages(payload) {
  const out = [];
  const entries = payload?.entry || [];
  for (const e of entries) {
    const changes = e?.changes || [];
    for (const ch of changes) {
      const v = ch?.value || {};
      const contacts = v?.contacts || [];
      const contactNameByWaId = new Map();
      for (const c of contacts) {
        const wa = c?.wa_id;
        const name = c?.profile?.name;
        if (wa && name) contactNameByWaId.set(wa, name);
      }
      const msgs = v?.messages || [];
      for (const m of msgs) {
        const id = m?.id;
        const from = m?.from;
        const ts = m?.timestamp;
        const type = m?.type || '';
        let text = '';
        if (type === 'text') text = m?.text?.body || '';
        else if (type === 'button') text = m?.button?.text || '';
        else if (type === 'interactive') {
          text = m?.interactive?.button_reply?.title || m?.interactive?.list_reply?.title || '';
        } else {
          // ITER15 inbound is text-only; store a placeholder note for unsupported types
          text = `[${type || 'message'}]`;
        }
        if (!id || !from) continue;
        const name = contactNameByWaId.get(from) || '';
        out.push({ id, from, name, ts, text, type });
      }
    }
  }
  return out;
}

function waTsToIso(ts) {
  const n = parseInt(ts || '', 10);
  if (!Number.isFinite(n)) return nowIso();
  return new Date(n * 1000).toISOString();
}

async function kvPutJson(kv, key, obj) {
  await kv.put(key, JSON.stringify(obj));
}

async function kvGetJson(kv, key) {
  const v = await kv.get(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return withCors(req, env, new Response(null, { status: 204 }));
    }

    // Basic health
    if (url.pathname === '/' || url.pathname === '/health') {
      return withCors(req, env, json({ ok: true, name: 'rosie-brain', ts: nowIso() }));
    }

    // Webhook verification (Meta)
    if (url.pathname === '/webhook' && req.method === 'GET') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token && token === env.VERIFY_TOKEN) {
        return withCors(req, env, new Response(challenge || '', { status: 200 }));
      }
      return withCors(req, env, new Response('Forbidden', { status: 403 }));
    }

    // Webhook receive
    if (url.pathname === '/webhook' && req.method === 'POST') {
      const bodyBytes = new Uint8Array(await req.arrayBuffer());
      // Optional signature verification (recommended)
      if (env.META_APP_SECRET) {
        const sig = await verifyWebhookSignature(req, env, bodyBytes);
        if (!sig.ok) return new Response('Bad signature', { status: 401 });
      }

      let payload = null;
      try { payload = JSON.parse(new TextDecoder().decode(bodyBytes)); } catch { }

      const msgs = extractWhatsAppMessages(payload);
      const saved = [];
      for (const m of msgs) {
        const iso = waTsToIso(m.ts);
        const record = {
          id: m.id,
          ts: iso,
          from: m.name ? m.name : m.from,
          wa_id: m.from,
          text: m.text,
          source: 'whatsapp',
          type: m.type,
          receivedAt: nowIso()
        };
        const key = `msg:${iso}:${m.id}`;
        // Idempotent: skip if already exists
        const existing = await env.INBOX_KV.get(key);
        if (!existing) {
          await kvPutJson(env.INBOX_KV, key, record);
          saved.push(record);
        }
      }

      return json({ ok: true, saved: saved.length }, 200);
    }

    // API pairing (no bearer required; Suhayl uses code)
    if (url.pathname === '/api/pair' && req.method === 'POST') {
      let body = null;
      try { body = await req.json(); } catch { }
      const code = (body?.code || '').toString().trim();
      if (!code || code !== env.PAIRING_CODE) {
        return withCors(req, env, json({ ok: false, error: 'Invalid code' }, 403));
      }
      const token = await issueToken(env);
      return withCors(req, env, json({ ok: true, token }));
    }

    // Protected endpoints
    if (url.pathname.startsWith('/api/')) {
      const tok = bearer(req);
      const v = await verifyToken(env, tok);
      if (!v.ok) return withCors(req, env, json({ ok: false, error: 'Unauthorized', reason: v.reason }, 401));

      // List inbox messages
      if (url.pathname === '/api/inbox' && req.method === 'GET') {
        const limit = clampLimit(url.searchParams.get('limit'), env);
        const cursor = url.searchParams.get('cursor') || undefined;
        const listed = await env.INBOX_KV.list({ prefix: 'msg:', limit, cursor });
        const items = [];
        for (const k of listed.keys) {
          const msg = await kvGetJson(env.INBOX_KV, k.name);
          if (msg) items.push(msg);
        }
        // newest first (keys are ISO so already sorted lexicographically asc); reverse
        items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
        return withCors(req, env, json({ ok: true, items, cursor: listed.cursor || '' }));
      }

      // Post a filing (deltas + receipt) so other parents can sync
      if (url.pathname === '/api/file' && req.method === 'POST') {
        let body = null;
        try { body = await req.json(); } catch { }
        const messageId = (body?.messageId || '').toString().trim();
        if (!messageId) return withCors(req, env, json({ ok: false, error: 'messageId required' }, 400));

        const pointerKey = `file_by_msg:${messageId}`;
        const existingPointer = await env.INBOX_KV.get(pointerKey);
        if (existingPointer) {
          const existing = await kvGetJson(env.INBOX_KV, existingPointer);
          return withCors(req, env, json({ ok: false, error: 'Already filed', existing }, 409));
        }

        const filedAt = (body?.filedAt || nowIso()).toString();
        const fileKey = `file:${filedAt}:${messageId}`;
        const record = {
          v: 1,
          messageId,
          filedAt,
          from: (body?.from || '').toString(),
          text: (body?.text || '').toString(),
          receipt: body?.receipt || null,
          deltas: body?.deltas || { events: [], tasks: [], groceries: [] }
        };

        await kvPutJson(env.INBOX_KV, fileKey, record);
        await env.INBOX_KV.put(pointerKey, fileKey);

        return withCors(req, env, json({ ok: true }));
      }

      // List filings (updates) for syncing to other phones
      if (url.pathname === '/api/updates' && req.method === 'GET') {
        const limit = clampLimit(url.searchParams.get('limit'), env);
        const cursor = url.searchParams.get('cursor') || undefined;
        const listed = await env.INBOX_KV.list({ prefix: 'file:', limit, cursor });
        const items = [];
        for (const k of listed.keys) {
          const file = await kvGetJson(env.INBOX_KV, k.name);
          if (file) items.push(file);
        }
        // newest first
        items.sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
        return withCors(req, env, json({ ok: true, items, cursor: listed.cursor || '' }));
      }

      return withCors(req, env, json({ ok: false, error: 'Not found' }, 404));
    }

    return withCors(req, env, json({ ok: false, error: 'Not found' }, 404));
  }
};
