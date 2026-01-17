import { uid } from './store.js';
const MAP=[{re:/\bnasima\b/i,id:'nasima'},{re:/\bsuhayl\b/i,id:'suhayl'},{re:/\brayhaan\b/i,id:'rayhaan'},{re:/\bzaara\b/i,id:'zaara'},{re:/\bjabu\b/i,id:'jabu'},{re:/\blisa\b/i,id:'lisa'}];
const people=text=>Array.from(new Set(MAP.filter(m=>m.re.test(text)).map(m=>m.id)));
function parseTime(text){
  const m=text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if(m){ let h=parseInt(m[1],10); const min=parseInt(m[2]||'0',10); const ap=m[3].toLowerCase();
    if(ap==='pm' && h<12) h+=12; if(ap==='am' && h===12) h=0; return {h,min}; }
  const m2=text.match(/\b(\d{1,2}):(\d{2})\b/); if(m2) return {h:parseInt(m2[1],10),min:parseInt(m2[2],10)};
  return null;
}
function parseWhere(text){ const m=text.match(/\bat\s+([a-z0-9 _-]{2,40})\b/i); return m?m[1].trim():''; }
export function routeCapture(state, text, source='app'){
  const now=new Date(); const ids=people(text); const out={events:[],tasks:[],groceries:[],notes:[]}; const lower=text.toLowerCase();
  if(/\b(buy|add to groceries|groceries|shopping)\b/.test(lower)){
    const cleaned=text.replace(/\b(buy|add to groceries|groceries|shopping)\b/ig,'').trim();
    cleaned.split(/[\n,;]/).map(s=>s.trim()).filter(Boolean).forEach(it=> out.groceries.push({id:uid('groc'),text:it,done:false,createdAt:now.toISOString(),source}));
    return out;
  }
  const bring=text.match(/\bbring\s+([^,.]+)\b/i);
  if(bring) out.tasks.push({id:uid('task'),title:'Bring '+bring[1].trim(),assignees:ids.length?ids:['nasima','suhayl'],due:null,priority:'high',done:false,createdAt:now.toISOString(),source});
  if(/\b(tell|ask)\s+(lisa|jabu)\b/i.test(text)){
    const who=/\blisa\b/i.test(text)?'lisa':'jabu';
    out.tasks.push({id:uid('task'),title:text.replace(/\b(tell|ask)\s+/i,'').trim(),assignees:[who],due:null,priority:'normal',done:false,createdAt:now.toISOString(),source});
  }
  const time=parseTime(text); const where=parseWhere(text);
  if(time){
    const d=new Date(); d.setHours(time.h,time.min,0,0);
    const end=new Date(d); end.setMinutes(end.getMinutes()+60);
    out.events.push({id:uid('ev'),title:text.trim().slice(0,80)||'Event',start:d.toISOString(),end:end.toISOString(),where,who:ids,createdAt:now.toISOString(),source});
  }
  if(out.events.length===0 && out.tasks.length===0 && out.groceries.length===0) out.notes.push({id:uid('note'),text,createdAt:now.toISOString(),source});
  return out;
}
