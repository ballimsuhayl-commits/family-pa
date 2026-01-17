import { uid } from './store.js';

/**
 * Minimal ICS parser for household calendars (school .ics).
 * Handles common VEVENT fields: SUMMARY, DESCRIPTION, LOCATION, DTSTART, DTEND.
 * Supports:
 * - DTSTART/DTEND as UTC (Z) or local floating
 * - all-day dates (VALUE=DATE or YYYYMMDD)
 *
 * Note: iCalendar is complex (timezones, RRULE). This is a pragmatic subset.
 */

function unfoldIcs(text){
  return text.replace(/\r?\n[ \t]/g, '');
}

function parseParams(line){
  const idx = line.indexOf(':');
  const left = idx>=0 ? line.slice(0, idx) : line;
  const value = idx>=0 ? line.slice(idx+1) : '';
  const parts = left.split(';');
  const key = (parts[0]||'').trim().toUpperCase();
  const params = {};
  for(let i=1;i<parts.length;i++){
    const seg = parts[i];
    const eq = seg.indexOf('=');
    if(eq<0) continue;
    const k = seg.slice(0, eq).trim().toUpperCase();
    const v = seg.slice(eq+1).trim();
    params[k] = v;
  }
  return { key, params, value: (value||'').trim() };
}

function parseIcsDate(value, params){
  // DATE: YYYYMMDD
  if((params?.VALUE||'').toUpperCase()==='DATE' || /^\d{8}$/.test(value)){
    const y = parseInt(value.slice(0,4),10);
    const m = parseInt(value.slice(4,6),10)-1;
    const d = parseInt(value.slice(6,8),10);
    // Use local all-day start (midnight)
    const dt = new Date(y,m,d,0,0,0,0);
    return { date: dt, allDay: true };
  }
  // DATETIME: YYYYMMDDTHHMMSS(Z?) or YYYYMMDDTHHMM(Z?)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if(!m) return { date: null, allDay: false };
  const y = parseInt(m[1],10);
  const mo = parseInt(m[2],10)-1;
  const d = parseInt(m[3],10);
  const hh = parseInt(m[4],10);
  const mm = parseInt(m[5],10);
  const ss = parseInt(m[6]||'0',10);
  const isUtc = !!m[7];
  if(isUtc){
    return { date: new Date(Date.UTC(y,mo,d,hh,mm,ss)), allDay: false };
  }
  return { date: new Date(y,mo,d,hh,mm,ss), allDay: false };
}

function stripHtml(s){
  return (s||'').replace(/<[^>]+>/g,'').replace(/\\n/g,'\n').replace(/\s+/g,' ').trim();
}

export function parseIcs(text){
  const raw = unfoldIcs(text);
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);

  const events = [];
  let cur = null;

  for(const line of lines){
    const up = line.toUpperCase();
    if(up==='BEGIN:VEVENT'){
      cur = { summary:'', description:'', location:'', dtstart:null, dtend:null, allDay:false };
      continue;
    }
    if(up==='END:VEVENT'){
      if(cur && cur.dtstart){
        const start = cur.dtstart;
        let end = cur.dtend;
        if(!end){
          end = new Date(start.getTime() + (cur.allDay ? 24*60*60*1000 : 60*60*1000));
        }
        events.push({
          id: uid('ev'),
          title: stripHtml(cur.summary) || 'Event',
          description: stripHtml(cur.description),
          where: stripHtml(cur.location),
          start: start.toISOString(),
          end: end.toISOString(),
          allDay: !!cur.allDay
        });
      }
      cur = null;
      continue;
    }
    if(!cur) continue;

    const { key, params, value } = parseParams(line);
    if(key==='SUMMARY') cur.summary += (cur.summary ? ' ' : '') + value;
    else if(key==='DESCRIPTION') cur.description += (cur.description ? '\n' : '') + value;
    else if(key==='LOCATION') cur.location += (cur.location ? ' ' : '') + value;
    else if(key==='DTSTART'){
      const r = parseIcsDate(value, params);
      cur.dtstart = r.date;
      cur.allDay = r.allDay;
    }else if(key==='DTEND'){
      const r = parseIcsDate(value, params);
      cur.dtend = r.date;
    }
  }
  return events;
}

export function enrichImportedEvents(state, importedEvents){
  const rules = state.settings?.autoAssignRules || [];
  const typeRules = state.settings?.autoTypeRules || [];

  function matchPeople(text){
    const hits = [];
    for(const r of rules){
      try{
        if(!r.keyword || !r.target) continue;
        const re = new RegExp(r.keyword, 'i');
        if(re.test(text)) hits.push(r.target);
      }catch(e){}
    }
    return Array.from(new Set(hits));
  }

  function matchType(text){
    for(const r of typeRules){
      try{
        if(!r.keyword || !r.type) continue;
        const re = new RegExp(r.keyword, 'i');
        if(re.test(text)) return r.type;
      }catch(e){}
    }
    return 'Other';
  }

  return importedEvents.map(ev => {
    const blob = `${ev.title}\n${ev.description||''}\n${ev.where||''}`;
    const who = matchPeople(blob);
    const type = matchType(blob.toLowerCase());
    return {
      ...ev,
      who,
      type,
      source: 'ics',
      createdAt: new Date().toISOString()
    };
  });
}
