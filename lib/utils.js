export function makeUid(prefix='id_') {
  return prefix + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function nowISO() { return new Date().toISOString(); }

export function formatDay(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' });
  } catch { return String(iso); }
}
export function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });
  } catch { return ''; }
}

// Very lightweight instruction parser for home use.
// Handles patterns like:
// - "Zaara swimming at 2pm, forgot goggles bring them"
// - "tell Lisa to water plants tomorrow 9am"
// - "buy milk eggs bread"
// - "remind me dentist next Thursday 3pm"
export function parseInstruction(text, ctx) {
  const family = ctx.family || [];
  const now = ctx.now || new Date();
  const t = text.trim();

  const lower = t.toLowerCase();

  // Grocery
  if (/(grocery|grocer|shopping|buy|get)/.test(lower)) {
    const items = t
      .replace(/^(grocery|groceries|shopping|buy|get)[:\s]*/i,'')
      .split(/,|\band\b/i)
      .map(s=>s.trim())
      .filter(Boolean)
      .slice(0, 20);
    return { kind:'grocery', items };
  }

  // Status
  const statusMatch = lower.match(/\b(i am|i'm|status)\s+(ok|busy|out|sleeping|at work|driving)\b/);
  if (statusMatch) {
    return { kind:'status', whoId: guessWho(lower, family), status: statusMatch[2], note:'' };
  }

  // Task: "tell Lisa to ..."
  const tell = lower.match(/\b(tell|ask|remind)\s+([a-z]+)\s+(to|that)\s+(.+)/i);
  if (tell) {
    const assigneeName = tell[2];
    const assignee = resolvePerson(assigneeName, family);
    const rest = t.slice(t.toLowerCase().indexOf(assigneeName) + assigneeName.length).replace(/^(\s+to\s+|\s+that\s+)/i,'').trim();
    const dueAt = parseWhen(rest, now);
    const title = rest.replace(/\b(today|tomorrow|next\s+\w+|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/ig,'').trim();
    return {
      kind:'task',
      title: title || rest,
      assigneeIds: assignee ? [assignee.id] : [],
      dueAt,
      notes:''
    };
  }

  // Event: look for "at 2pm" or date+time
  const when = parseWhen(t, now);
  if (when) {
    // Try to detect who
    const who = detectWho(t, family);
    const whoIds = who.length ? who.map(x=>x.id) : [guessWho(lower, family)];
    // Title: strip common filler phrases
    let title = t
      .replace(/\b(at|on)\b.+$/i,'')
      .replace(/\b(mum|dad|please|forgot|bring|remind me)\b/ig,'')
      .trim();
    title = title || 'Event';

    // Attachment: "forgot my goggles" -> task for parents
    const attachedTask = parseAttachedBringTask(t, family, when);

    // default end: +60 mins
    const end = new Date(new Date(when).getTime() + 60*60*1000).toISOString();
    return {
      kind:'event',
      title,
      startAt: when,
      endAt: end,
      whoIds,
      notes: extractNotes(t),
      attachedTask
    };
  }

  // Fallback unknown
  return { kind:'unknown', raw: t };
}

function resolvePerson(name, family) {
  const n = (name||'').toLowerCase();
  return family.find(m => m.name.toLowerCase().startsWith(n) || (m.id||'').toLowerCase()===n) || null;
}

function detectWho(text, family) {
  const lower = text.toLowerCase();
  return family.filter(m => lower.includes(m.name.toLowerCase()) || lower.includes(m.id.toLowerCase()));
}

function guessWho(lower, family) {
  // prefer "me" set by context? caller handles. Fallback Nasima.
  const mum = family.find(m=>m.id==='nasima'); 
  return mum ? mum.id : (family[0]?.id || 'nasima');
}

function parseWhen(text, now) {
  const lower = text.toLowerCase();

  // time like 2pm / 14:30
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (!timeMatch) return null;

  let hour = parseInt(timeMatch[1],10);
  const min = timeMatch[2] ? parseInt(timeMatch[2],10) : 0;
  const ap = timeMatch[3];
  if (ap) {
    if (ap === 'pm' && hour < 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
  }

  // date hints
  let dayOffset = 0;
  if (/\btomorrow\b/.test(lower)) dayOffset = 1;
  if (/\btoday\b/.test(lower)) dayOffset = 0;

  const nextDay = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  let target = new Date(now);
  target.setSeconds(0,0);

  if (nextDay) {
    const wanted = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(nextDay[1]);
    const current = target.getDay();
    let delta = (wanted - current + 7) % 7;
    if (delta === 0) delta = 7;
    target.setDate(target.getDate() + delta);
  } else {
    target.setDate(target.getDate() + dayOffset);
  }

  target.setHours(hour, min, 0, 0);
  const iso = target.toISOString();
  return iso;
}

function extractNotes(t) {
  const m = t.match(/\b(forgot.+)$/i);
  return m ? m[1].trim() : '';
}

function parseAttachedBringTask(text, family, whenIso) {
  const lower = text.toLowerCase();
  // Example: "forgot my goggles, please bring them"
  if (!/(forgot|forgotten).+\b(bring)\b/.test(lower)) return null;

  // Task: bring X
  const thing = (text.match(/forgot\s+(my\s+)?([a-z ]{2,40})\b/i)?.[2] || 'item').trim();
  const parents = family.filter(m => m.id==='nasima' || m.id==='suhayl').map(m=>m.id);
  // Reminder slightly before event (90 minutes)
  const due = new Date(new Date(whenIso).getTime() - 90*60*1000).toISOString();
  return {
    title: `Bring ${thing}`,
    assigneeIds: parents,
    dueAt: due,
    notes: 'From WhatsApp message'
  };
}
