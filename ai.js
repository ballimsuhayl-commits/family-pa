import { routeCapture } from './parser.js';

/**
 * AI-assisted routing (ITER18)
 * - Never requires AI; falls back to existing rule-based parser.
 * - Uses Rosie Brain (Cloudflare Worker) so no API keys live in the browser.
 */

function safeText(s, max=2000){
  s = (s ?? '').toString();
  if(s.length > max) return s.slice(0, max);
  return s;
}

export async function routeCaptureSmart(state, text, source='app', meta={}){
  const raw = safeText(text, 2000);
  const enabled = !!state?.settings?.aiEnabled;
  const bridgeUrl = (state?.settings?.bridgeUrl || '').trim().replace(/\/$/, '');
  const token = (state?.settings?.bridgeToken || '').trim();

  if(!enabled || !bridgeUrl || !token){
    return routeCapture(state, raw, source);
  }

  // Ask the bridge to parse; if anything fails, fall back to rules.
  try{
    const res = await fetch(bridgeUrl + '/api/ai/parse', {
      method: 'POST',
      headers: { 'content-type':'application/json', 'Authorization':'Bearer ' + token },
      body: JSON.stringify({
        text: raw,
        source,
        // helps the server resolve relative dates
        nowIso: new Date().toISOString(),
        tzOffsetMinutes: -new Date().getTimezoneOffset(),
        // optional metadata (e.g. whatsapp message id) for de-dupe
        messageId: meta.messageId || null,
        from: meta.from || null
      })
    });

    const data = await res.json().catch(()=>null);
    if(!res.ok || !data || !data.ok || !data.routed){
      return routeCapture(state, raw, source);
    }

    // Ensure sources are set, so receipts show "came from"
    for(const e of (data.routed.events||[])) if(!e.source) e.source = source;
    for(const t of (data.routed.tasks||[])) if(!t.source) t.source = source;
    for(const g of (data.routed.groceries||[])) if(!g.source) g.source = source;
    for(const n of (data.routed.notes||[])) if(!n.source) n.source = source;

    return data.routed;
  }catch(e){
    return routeCapture(state, raw, source);
  }
}
