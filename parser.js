import { uid } from './store.js';

const NAME_MAP = [
  { key: /\bnasima\b/i, id:'nasima' },
  { key: /\bsuhayl\b/i, id:'suhayl' },
  { key: /\brayhaan\b/i, id:'rayhaan' },
  { key: /\bzaara\b/i, id:'zaara' },
  { key: /\bjabu\b/i, id:'jabu' },
  { key: /\blisa\b/i, id:'lisa' }
];

function parseTime(text){
  const m1 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if(m1){
    let h = parseInt(m1[1],10);
    const min = parseInt(m1[2]||'0',10);
    const ap = (m1[3]||'').toLowerCase();
    if(ap==='pm' && h<12) h += 12;
    if(ap==='am' && h===12) h = 0;
    return { h, min };
  }
  const m2 = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if(m2) return { h: parseInt(m2[1],10), min: parseInt(m2[2],10) };
  return null;
}

function parseDate(text){
  const t = text.toLowerCase();
  const now = new Date();
  const base = new Date(now);
  base.setHours(0,0,0,0);

  if(/\btoday\b/.test(t)) return base;
  if(/\btomorrow\b/.test(t)){ base.setDate(base.getDate()+1); return base; }

  const wd = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const m = t.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if(m){
    const target = wd.indexOf(m[1]);
    const cur = base.getDay();
    let diff = (target - cur + 7) % 7;
    if(diff===0) diff = 7;
    diff += 7;
    base.setDate(base.getDate()+diff);
    return base;
  }
  return null;
}

function parseWhere(text){
  const m = text.match(/\bat\s+([a-z0-9 _-]{2,60})\b/i);
  return m ? m[1].trim() : '';
}

function detectPeople(text){
  const ids = [];
  for(const n of NAME_MAP){
    if(n.key.test(text)) ids.push(n.id);
  }
  return Array.from(new Set(ids));
}

function splitItems(text){
  return text.split(/[\n,;]/).map(s=>s.trim()).filter(Boolean);
}

export function routeCapture(state, text, source='app'){
  const inferType = (lower)=>{
    if(/\b(lisa|jabu)\b/.test(lower)) return 'Staff';
    if(/\b(school|tuition|swimming|parents evening|exam|sports day)\b/.test(lower)) return 'School';
    if(/\b(grocer|shopping|dinner|family|birthday|home)\b/.test(lower)) return 'Home';
    return 'Other';
  };

  const now = new Date();
  const people = detectPeople(text);
  const lower = text.toLowerCase();
  const out = { events:[], tasks:[], groceries:[], notes:[] };
  const groupId = uid('grp');

  if(/\b(buy|add to groceries|groceries|shopping)\b/.test(lower)){
    const cleaned = text.replace(/\b(buy|add to groceries|groceries|shopping)\b/ig,'').trim();
    for(const it of splitItems(cleaned)){
      out.groceries.push({ id: uid('groc'), text: it, done: false, createdAt: now.toISOString(), source });
    }
    return out;
  }

  const bring = text.match(/\bbring\s+([^,.]+)\b/i);
  if(bring){
    out.tasks.push({
      id: uid('task'),
      title: 'Bring ' + bring[1].trim(),
      assignees: people.length ? people : ['nasima','suhayl'],
      due: null,
      priority: 'high',
      relatedGroupId: groupId,
      relatedEventId: null,
      done:false,
      createdAt: now.toISOString(),
      source
    });
  }

  if(/\b(tell|ask)\s+(lisa|jabu)\b/i.test(text)){
    const who = /\blisa\b/i.test(text) ? 'lisa' : 'jabu';
    out.tasks.push({
      id: uid('task'),
      title: text.replace(/\b(tell|ask)\s+/i,'').trim(),
      assignees: [who],
      due: null,
      priority: 'normal',
      relatedGroupId: groupId,
      relatedEventId: null,
      done:false,
      createdAt: now.toISOString(),
      source
    });
  }

  const time = parseTime(text);
  const date = parseDate(text) || new Date();
  const where = parseWhere(text);

  if(time){
    const start = new Date(date);
    start.setHours(time.h, time.min, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes()+60);

    const ev = {
      id: uid('ev'),
      relatedGroupId: groupId,
      type: inferType(lower),
      title: text.replace(/\b(mum|dad)\b/ig,'').trim() || 'Event',
      start: start.toISOString(),
      end: end.toISOString(),
      where,
      who: people.length ? people : [],
      createdAt: now.toISOString(),
      source
    };
    out.events.push(ev);

    for(const t of out.tasks){
      if(t.relatedGroupId === groupId && (t.title||'').toLowerCase().startsWith('bring ')){
        t.relatedEventId = ev.id;
        const due = new Date(start.getTime() - 60*60*1000);
        t.due = due.toISOString();
      }
    }
  }

  if(out.events.length===0 && out.tasks.length===0 && out.groceries.length===0){
    out.notes.push({ id: uid('note'), text, createdAt: now.toISOString(), source });
  }

  return out;
}
