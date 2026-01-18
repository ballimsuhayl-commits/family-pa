/**
 * Rosie Brain — Cloudflare Worker
 * ITER21: Per-household routing + delivery status tracking + KV backup/restore
 *
 * Security goals:
 * - No permissive CORS
 * - No secrets in frontend
 * - Bearer tokens are HMAC-signed and revocable via token version bump
 */

function jsonResponse(obj, status=200, headers={}){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function textResponse(text, status=200, headers={}){
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers }});
}

function corsHeaders(request, env){
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  if(!origin) return {};
  if(allowed.includes(origin)) return {
    'access-control-allow-origin': origin,
    'vary': 'Origin',
    'access-control-allow-credentials': 'false',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS'
  };
  return {}; // no CORS if not allowed
}

function isPreflight(request){
  return request.method === 'OPTIONS' &&
    request.headers.get('Origin') &&
    request.headers.get('Access-Control-Request-Method');
}

function base64url(bytes){
  const bin = typeof bytes === 'string' ? bytes : String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64urlDecodeToString(s){
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while(s.length % 4) s += '=';
  return atob(s);
}

async function hmacSign(secret, data){
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64url(sig);
}

async function hmacVerify(secret, data, sig){
  const expected = await hmacSign(secret, data);
  return timingSafeEqual(expected, sig);
}

function timingSafeEqual(a,b){
  if(typeof a !== 'string' || typeof b !== 'string') return false;
  if(a.length !== b.length) return false;
  let out = 0;
  for(let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function randDigits(n=6){
  let s='';
  while(s.length<n) s += Math.floor(Math.random()*10);
  return s.slice(0,n);
}

function getDefaultGid(env){ return (env.DEFAULT_GID || 'family').trim() || 'family'; }

function parseHouseholdMap(env){
  const raw = (env.HOUSEHOLD_MAP_JSON || '').trim();
  if(!raw) return {};
  try{
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  }catch{
    return {};
  }
}

function gidPrefix(gid){ return `h:${gid}:`; }

async function kvGet(env, key){
  const kv = env.INBOX_KV;
  if(!kv) return null;
  if(typeof kv.get === 'function') return await kv.get(key);
  // Map fallback (tests)
  return kv.get(key) ?? null;
}
async function kvPut(env, key, value, opts={}){
  const kv = env.INBOX_KV;
  if(!kv) return;
  if(typeof kv.put === 'function') return await kv.put(key, value, opts);
  kv.set(key, value);
}
async function kvDel(env, key){
  const kv = env.INBOX_KV;
  if(!kv) return;
  if(typeof kv.delete === 'function') return await kv.delete(key);
  kv.delete(key);
}
async function kvList(env, prefix, cursor){
  const kv = env.INBOX_KV;
  if(!kv) return { keys:[], list_complete:true, cursor: undefined };
  if(typeof kv.list === 'function') return await kv.list({ prefix, cursor, limit: 1000 });
  // Map fallback
  const keys = [];
  for(const k of kv.keys()){
    if(k.startsWith(prefix)) keys.push({ name: k });
  }
  return { keys, list_complete:true, cursor: undefined };
}

async function audit(env, gid, event, detail={}){
  const key = gidPrefix(gid) + 'audit';
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...detail
  });
  const prev = await kvGet(env, key);
  const arr = prev ? safeJsonParse(prev, []) : [];
  arr.unshift(line);
  if(arr.length > 2000) arr.length = 2000;
  await kvPut(env, key, JSON.stringify(arr));
}

function safeJsonParse(s, fallback){
  try{ return JSON.parse(s); }catch{ return fallback; }
}

async function getAuthVer(env, gid){
  const key = gidPrefix(gid) + 'authver';
  const v = await kvGet(env, key);
  const n = parseInt(v || '1', 10);
  if(!v) await kvPut(env, key, String(n));
  return Number.isFinite(n) && n>0 ? n : 1;
}

async function setAuthVer(env, gid, ver){
  const key = gidPrefix(gid) + 'authver';
  await kvPut(env, key, String(ver));
}

async function getPairCode(env, gid){
  const key = gidPrefix(gid) + 'paircode';
  const v = await kvGet(env, key);
  return (v || env.PAIRING_CODE || '').trim();
}

async function setPairCode(env, gid, code){
  const key = gidPrefix(gid) + 'paircode';
  await kvPut(env, key, code);
}

async function issueToken(env, gid, deviceId){
  const secret = (env.BRIDGE_SHARED_SECRET || '').trim();
  if(!secret) throw new Error('missing BRIDGE_SHARED_SECRET');
  const ver = await getAuthVer(env, gid);
  const payload = { gid, did: deviceId, iat: Date.now(), ver };
  const p = base64url(JSON.stringify(payload));
  const sig = await hmacSign(secret, p);
  return `${p}.${sig}`;
}

async function verifyToken(env, token){
  const secret = (env.BRIDGE_SHARED_SECRET || '').trim();
  if(!secret || !token) return { ok:false };
  const parts = token.split('.');
  if(parts.length !== 2) return { ok:false };
  const [p,sig] = parts;
  const ok = await hmacVerify(secret, p, sig);
  if(!ok) return { ok:false };
  const payload = safeJsonParse(base64urlDecodeToString(p), null);
  if(!payload || typeof payload !== 'object') return { ok:false };
  const gid = String(payload.gid || '').trim();
  const ver = Number(payload.ver || 0);
  const current = await getAuthVer(env, gid);
  if(ver !== current) return { ok:false, reason:'revoked' };
  return { ok:true, gid, did: String(payload.did||''), payload };
}

function getBearer(request){
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function requireAuth(request, env){
  const tok = getBearer(request);
  const v = await verifyToken(env, tok);
  if(!v.ok) return null;
  return v;
}

async function readJson(request){
  const ct = request.headers.get('content-type') || '';
  if(!ct.includes('application/json')) throw new Error('expected json');
  return await request.json();
}

function pickGidFromRequest(url, env, auth){
  const qp = url.searchParams.get('gid');
  if(qp) return qp.trim();
  if(auth?.gid) return auth.gid;
  return getDefaultGid(env);
}

function parseWhatsAppGid(env, value){
  const map = parseHouseholdMap(env);
  const meta = value?.metadata || {};
  const phoneNumberId = String(meta.phone_number_id || '').trim();
  if(phoneNumberId && map[phoneNumberId]) return String(map[phoneNumberId]);
  return getDefaultGid(env);
}

async function handleWebhook(request, env){
  const url = new URL(request.url);
  if(request.method === 'GET'){
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if(mode === 'subscribe' && token && token === (env.VERIFY_TOKEN||'')){
      return textResponse(challenge || '', 200);
    }
    return textResponse('forbidden', 403);
  }

  if(request.method !== 'POST') return textResponse('method not allowed', 405);

  const body = await request.json().catch(()=>null);
  if(!body) return textResponse('bad', 400);

  // WhatsApp payload shape: entry[].changes[].value
  const entry = (body.entry || [])[0];
  const change = (entry?.changes || [])[0];
  const value = change?.value || {};
  const gid = parseWhatsAppGid(env, value);

  // Delivery statuses
  if(Array.isArray(value.statuses) && value.statuses.length){
    for(const st of value.statuses){
      const id = String(st.id||'').trim();
      if(!id) continue;
      const rec = {
        id,
        status: st.status || 'unknown',
        timestamp: st.timestamp ? Number(st.timestamp)*1000 : Date.now(),
        recipient_id: st.recipient_id || null,
        conversation: st.conversation || null,
        pricing: st.pricing || null
      };
      await kvPut(env, gidPrefix(gid) + 'status:' + id, JSON.stringify(rec), { expirationTtl: 60*60*24*60 }); // 60 days
    }
    await audit(env, gid, 'wa_status', { count: value.statuses.length });
    return textResponse('ok', 200);
  }

  // Messages
  if(Array.isArray(value.messages) && value.messages.length){
    const inboxKey = gidPrefix(gid) + 'inbox';
    const prev = safeJsonParse(await kvGet(env, inboxKey) || '[]', []);
    for(const msg of value.messages){
      const id = String(msg.id||'').trim() || ('wa_' + Date.now());
      const from = String(msg.from||'').trim() || 'Unknown';
      let text = '';
      if(msg.type === 'text') text = msg.text?.body || '';
      else if(msg.type === 'audio') text = '(voice note)';
      else text = `(${msg.type || 'message'})`;
      const item = {
        id,
        ts: new Date().toISOString(),
        from,
        text,
        source: 'whatsapp',
        wa: {
          type: msg.type || 'unknown',
          raw: { id, from }
        },
        receipt: null
      };
      // de-dupe by id
      if(!prev.some(x=>x.id===id)) prev.unshift(item);
    }
    if(prev.length > 500) prev.length = 500;
    await kvPut(env, inboxKey, JSON.stringify(prev));
    await audit(env, gid, 'wa_inbound', { count: value.messages.length });
    return textResponse('ok', 200);
  }

  return textResponse('ok', 200);
}

async function handlePair(request, env, url){
  const body = await readJson(request).catch(()=>({}));
  const gid = String(body.gid || url.searchParams.get('gid') || getDefaultGid(env)).trim();
  const code = String(body.pairingCode || '').trim();
  const deviceId = String(body.deviceId || ('dev_' + crypto.randomUUID())).trim();

  const expected = await getPairCode(env, gid);
  if(!expected || code !== expected){
    await audit(env, gid, 'pair_failed', { deviceId });
    return jsonResponse({ ok:false, error:'invalid_code' }, 403);
  }
  const token = await issueToken(env, gid, deviceId);
  await audit(env, gid, 'paired', { deviceId });
  return jsonResponse({ ok:true, token, gid });
}

async function handleAdminRotate(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);
  const newCode = randDigits(6);
  const current = await getAuthVer(env, gid);
  await setAuthVer(env, gid, current + 1);
  await setPairCode(env, gid, newCode);
  await audit(env, gid, 'admin_rotate', { by: auth.did });
  return jsonResponse({ ok:true, pairingCode: newCode });
}

async function handleInbox(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);
  const key = gidPrefix(gid) + 'inbox';
  const items = safeJsonParse(await kvGet(env, key) || '[]', []);
  // Attach latest delivery status if present (for receipts that include waOutboundId)
  for(const it of items){
    const outId = it?.receipt?.waOutboundId;
    if(outId){
      const st = await kvGet(env, gidPrefix(gid) + 'status:' + outId);
      if(st) it.waStatus = safeJsonParse(st, null);
    }
  }
  return jsonResponse({ ok:true, items });
}

async function handleFile(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);
  const body = await readJson(request).catch(()=>null);
  if(!body) return jsonResponse({ ok:false, error:'bad_body' }, 400);
  // Expected: { messageId, receipt, deltas }
  const messageId = String(body.messageId || '').trim();
  if(!messageId) return jsonResponse({ ok:false, error:'missing_messageId' }, 400);

  const inboxKey = gidPrefix(gid) + 'inbox';
  const items = safeJsonParse(await kvGet(env, inboxKey) || '[]', []);
  const idx = items.findIndex(x=>x.id===messageId);
  if(idx>=0){
    items[idx].receipt = body.receipt || items[idx].receipt || null;
    items[idx].filedAt = new Date().toISOString();
    // store optional outbound id link
    if(body.receipt?.waOutboundId) items[idx].receipt.waOutboundId = body.receipt.waOutboundId;
    await kvPut(env, inboxKey, JSON.stringify(items));
  }
  // Updates feed for cross-device sync
  const updKey = gidPrefix(gid) + 'updates';
  const prev = safeJsonParse(await kvGet(env, updKey) || '[]', []);
  prev.unshift({
    id: 'upd_' + crypto.randomUUID(),
    ts: new Date().toISOString(),
    deltas: body.deltas || {},
    receipt: body.receipt || null
  });
  if(prev.length > 500) prev.length = 500;
  await kvPut(env, updKey, JSON.stringify(prev));
  await audit(env, gid, 'filed', { by: auth.did, messageId });
  return jsonResponse({ ok:true });
}

async function handleUpdates(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);
  const since = request.url.includes('since=') ? Number(new URL(request.url).searchParams.get('since') || 0) : 0;
  const updKey = gidPrefix(gid) + 'updates';
  const items = safeJsonParse(await kvGet(env, updKey) || '[]', []);
  // Since is ms epoch; if absent, return latest 100
  const out = since ? items.filter(u=> Date.parse(u.ts) > since) : items.slice(0,100);
  return jsonResponse({ ok:true, items: out });
}

async function handleStatusRecent(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);
  const prefix = gidPrefix(gid) + 'status:';
  const listed = await kvList(env, prefix);
  const keys = (listed.keys || []).slice(0,50);
  const out = [];
  for(const k of keys){
    const v = await kvGet(env, k.name);
    if(v) out.push(safeJsonParse(v, null));
  }
  out.sort((a,b)=>(b?.timestamp||0)-(a?.timestamp||0));
  return jsonResponse({ ok:true, items: out.filter(Boolean).slice(0,50) });
}

async function handleBackupExport(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);

  const url = new URL(request.url);
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const prefix = gidPrefix(gid);
  let cursor = url.searchParams.get('cursor') || undefined;
  const full = url.searchParams.get('full') === 'true';

  const all = [];
  let loops = 0;
  let complete = false;
  while(true){
    const res = await kvList(env, prefix, cursor);
    cursor = res.cursor;
    for(const k of (res.keys||[])){
      const v = await kvGet(env, k.name);
      all.push({ key: k.name, value: v });
    }
    complete = !!res.list_complete;
    loops++;
    if(!full) break;
    if(complete) break;
    if(loops >= 5) break; // safety cap
  }

  await audit(env, gid, 'backup_export', { by: auth.did, count: all.length });

  if(format === 'ndjson'){
    const lines = all.map(it=>JSON.stringify(it)).join('\n') + '\n';
    return new Response(lines, {
      status: 200,
      headers: { 'content-type':'application/x-ndjson; charset=utf-8' }
    });
  }
  return jsonResponse({
    ok:true,
    gid,
    exportedAt: new Date().toISOString(),
    items: all,
    cursor: complete ? null : (cursor || null),
    complete
  });
}

async function handleBackupImport(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);

  const body = await readJson(request).catch(()=>null);
  const items = body?.items;
  if(!Array.isArray(items) || items.length===0) return jsonResponse({ ok:false, error:'missing_items' }, 400);
  if(items.length > 2000) return jsonResponse({ ok:false, error:'too_many_items' }, 400);

  // Only allow importing keys inside this gid prefix
  const prefix = gidPrefix(gid);
  let written = 0;
  for(const it of items){
    const key = String(it.key||'');
    if(!key.startsWith(prefix)) continue;
    const val = (typeof it.value === 'string') ? it.value : JSON.stringify(it.value);
    await kvPut(env, key, val);
    written++;
  }
  await audit(env, gid, 'backup_import', { by: auth.did, written });
  return jsonResponse({ ok:true, written });
}

async function handleOutboundSendTest(request, env, gid){
  const auth = await requireAuth(request, env);
  if(!auth) return jsonResponse({ ok:false, error:'unauthorized' }, 401);
  const body = await readJson(request).catch(()=>({}));
  const to = String(body.to || '').trim();
  const text = String(body.text || 'Rosie test ping ✓').trim();

  if(!env.WA_ACCESS_TOKEN || !env.WA_PHONE_NUMBER_ID){
    return jsonResponse({ ok:false, error:'whatsapp_not_configured' }, 400);
  }
  if(!to) return jsonResponse({ ok:false, error:'missing_to' }, 400);

  const endpoint = `https://graph.facebook.com/v20.0/${env.WA_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text }
  };

  const resp = await fetch(endpoint, {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization': `Bearer ${env.WA_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload)
  });
  const data = await resp.json().catch(()=>({}));
  if(!resp.ok){
    await audit(env, gid, 'outbound_error', { by: auth.did, status: resp.status, data });
    return jsonResponse({ ok:false, error:'wa_send_failed', status: resp.status, data }, 502);
  }
  const waId = data?.messages?.[0]?.id || null;
  if(waId){
    await kvPut(env, gidPrefix(gid) + 'status:' + waId, JSON.stringify({
      id: waId, status: 'sent', timestamp: Date.now(), recipient_id: to
    }), { expirationTtl: 60*60*24*60 });
  }
  await audit(env, gid, 'outbound_sent', { by: auth.did, waId, to });
  return jsonResponse({ ok:true, waId, data });
}

async function handleHealth(){
  return textResponse('ok');
}

async function route(request, env, ctx){
  const url = new URL(request.url);
  const path = url.pathname;

  if(isPreflight(request)){
    const h = corsHeaders(request, env);
    // If origin not allowed, reply without CORS
    return new Response('', { status: 204, headers: h });
  }

  const cors = corsHeaders(request, env);
  const addCors = (res)=>{
    const h = new Headers(res.headers);
    for(const [k,v] of Object.entries(cors)) h.set(k,v);
    return new Response(res.body, { status: res.status, headers: h });
  };

  try{
    if(path === '/health') return addCors(await handleHealth());

    if(path === '/webhook') return addCors(await handleWebhook(request, env));

    // API
    if(path === '/api/pair' && request.method === 'POST') return addCors(await handlePair(request, env, url));

    // auth-required endpoints below
    const auth = await requireAuth(request, env);
    const gid = pickGidFromRequest(url, env, auth);

    if(path === '/api/admin/rotate' && request.method === 'POST') return addCors(await handleAdminRotate(request, env, gid));
    if(path === '/api/inbox' && request.method === 'GET') return addCors(await handleInbox(request, env, gid));
    if(path === '/api/file' && request.method === 'POST') return addCors(await handleFile(request, env, gid));
    if(path === '/api/updates' && request.method === 'GET') return addCors(await handleUpdates(request, env, gid));
    if(path === '/api/status/recent' && request.method === 'GET') return addCors(await handleStatusRecent(request, env, gid));
    if(path === '/api/backup/export' && request.method === 'GET') return addCors(await handleBackupExport(request, env, gid));
    if(path === '/api/backup/import' && request.method === 'POST') return addCors(await handleBackupImport(request, env, gid));
    if(path === '/api/outbound/sendTest' && request.method === 'POST') return addCors(await handleOutboundSendTest(request, env, gid));

    return addCors(textResponse('not found', 404));
  }catch(e){
    return addCors(jsonResponse({ ok:false, error:'server_error', message: String(e?.message||e) }, 500));
  }
}

export default {
  async fetch(request, env, ctx){
    return route(request, env, ctx);
  },
  async scheduled(event, env, ctx){
    // Placeholder for future scheduled jobs (reminders/digests) — kept no-op in ITER21 hardening package.
    // We still log that the cron ran.
    const gid = getDefaultGid(env);
    ctx.waitUntil(audit(env, gid, 'cron_tick', { scheduledTime: event.scheduledTime }));
  }
};
