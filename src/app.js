
export const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
export const nowIso = () => new Date().toISOString();
export const fmtWhen = (iso) => {
  try{
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
  }catch{return iso;}
};

export const defaultData = () => {
  const family = [
    { id: uid(), name:"Nasima", role:"Mum", isAdmin:true },
    { id: uid(), name:"Suhayl", role:"Dad", isAdmin:true },
    { id: uid(), name:"Rayhaan", role:"Son", isAdmin:false },
    { id: uid(), name:"Zaara", role:"Daughter", isAdmin:false },
    { id: uid(), name:"Jabu", role:"House helper", isAdmin:false },
    { id: uid(), name:"Lisa", role:"Maintenance & garden", isAdmin:false },
  ];
  const byName = Object.fromEntries(family.map(f=>[f.name.toLowerCase(), f.id]));
  return {
    version: "iter-fix-static-v1",
    family,
    status: {},
    events: [],
    tasks: [],
    groceries: [],
    inbox: [],
    voiceNotes: {},
    fired: {},
    settings: {
      reminderLeads: [7*24*60, 3*24*60, 24*60, 120],
      autoAssignRules: [
        { memberName:"Rayhaan", keywords:["rayhaan","year 7","yr7","football","rugby","karate","school"] },
        { memberName:"Zaara", keywords:["zaara","year 11","gcse","netball","school"] }
      ],
      dealHunt: { enabled:false },
      ai: { enabled:false, provider:"firebase", endpoint:"" }
    },
    session: { memberId: byName["nasima"] || "" }
  };
};

export const store = {
  key: "rosie.family.v1",
  init(){
    const cur = localStorage.getItem(this.key);
    if (!cur) localStorage.setItem(this.key, JSON.stringify(defaultData()));
    else {
      try{
        const parsed = JSON.parse(cur);
        if (!parsed.family) throw new Error("bad");
      }catch{
        localStorage.setItem(this.key, JSON.stringify(defaultData()));
      }
    }
  },
  get(){
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) : defaultData();
  },
  set(v){
    localStorage.setItem(this.key, JSON.stringify(v));
  }
};

// ICS parser (minimal, handles DTSTART/DTEND and SUMMARY)
export const parseIcs = (icsText) => {
  const lines = icsText.replace(/\r\n/g,"\n").split("\n");
  const events = [];
  let cur = null;
  const unfold = [];
  for (let i=0;i<lines.length;i++){
    const ln = lines[i];
    if (/^\s/.test(ln) && unfold.length){
      unfold[unfold.length-1] += ln.trim();
    } else unfold.push(ln.trim());
  }
  for (const line of unfold){
    if (line==="BEGIN:VEVENT"){ cur = {}; continue; }
    if (line==="END:VEVENT"){
      if (cur && cur.DTSTART && cur.DTEND){
        events.push({
          title: cur.SUMMARY || "Event",
          startISO: icsDateToIso(cur.DTSTART),
          endISO: icsDateToIso(cur.DTEND),
          location: cur.LOCATION || "",
          description: cur.DESCRIPTION || ""
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const [k0, v0] = line.split(/:(.+)/);
    if (!k0 || v0 === undefined) continue;
    const k = k0.split(";")[0];
    cur[k] = v0;
  }
  return events.filter(e=>e.startISO && e.endISO);
};

const icsDateToIso = (v) => {
  // supports: 20250117T090000Z or 20250117T090000
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?(Z)?$/);
  if (!m) return "";
  const [_,Y,M,D,h="00",mi="00",s="00",z] = m;
  if (z) return new Date(`${Y}-${M}-${D}T${h}:${mi}:${s}Z`).toISOString();
  // local
  return new Date(`${Y}-${M}-${D}T${h}:${mi}:${s}`).toISOString();
};

// Voice parsing / auto-routing (simple, robust)
export const parseVoice = (text, state) => {
  const raw = (text||"").trim();
  const lower = raw.toLowerCase();

  const previewChips = [];
  const groceries = [];
  const tasks = [];
  const statuses = [];
  const events = [];

  // groceries: "buy X, Y and Z"
  const buyMatch = lower.match(/\b(buy|get|purchase|need)\b(.+)/);
  if (buyMatch){
    const items = buyMatch[2]
      .replace(/for\s+the\s+week.*/,"")
      .split(/,| and /)
      .map(s=>s.trim())
      .filter(Boolean)
      .slice(0,10);
    for (const it of items){
      const cleaned = it.replace(/\.$/,"");
      if (cleaned.length>=2) groceries.push(cleaned);
    }
  }

  // tasks: "tell Lisa to ..." / "ask Jabu to ..."
  const whoNames = state.family.map(f=>f.name);
  for (const nm of whoNames){
    const re = new RegExp(`\\b(tell|ask|remind)\\s+${escapeRe(nm)}\\s+to\\s+(.+)`, "i");
    const m = raw.match(re);
    if (m){
      const title = m[2].replace(/\.$/,"").trim();
      const mem = state.family.find(f=>f.name.toLowerCase()===nm.toLowerCase());
      if (title && mem){
        tasks.push({ title, assigneeId: mem.id, dueISO: guessDue(raw), priority:"normal" });
      }
    }
  }

  // status: "I'm busy" / "we are home" etc
  const memberId = state.session?.memberId || "";
  if (memberId){
    if (/\b(i am|i'm)\s+busy\b/i.test(raw)) statuses.push({ memberId, status:"Busy" });
    if (/\b(i am|i'm)\s+home\b/i.test(raw)) statuses.push({ memberId, status:"Home" });
    if (/\b(i am|i'm)\s+out\b/i.test(raw)) statuses.push({ memberId, status:"Out" });
  }

  // calendar: "remind me ..." or "parents evening next Thursday at 6"
  if (/\b(remind me|appointment|parents evening|meeting|doctor|school)\b/i.test(raw)){
    const dt = guessDateTime(raw);
    if (dt){
      const start = dt;
      const end = new Date(start.getTime() + 60*60*1000);
      events.push({
        title: raw.replace(/^remind me\s*/i,"").slice(0,80),
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        ownerId: memberId || "",
        notes: "",
        source:"voice"
      });
    }
  }

  // preview chips
  if (groceries.length) previewChips.push({ kind:"ok", text:`Groceries: ${groceries.slice(0,3).join(", ")}${groceries.length>3?"…":""}` });
  if (tasks.length) previewChips.push({ kind:"warn", text:`Task: ${tasks[0].title}` });
  if (events.length) previewChips.push({ kind:"ok", text:`Event: ${events[0].title}` });
  if (statuses.length) previewChips.push({ kind:"ok", text:`Status: ${statuses[0].status}` });
  if (!previewChips.length && raw) previewChips.push({ kind:"", text:"Saved to Inbox" });

  return { raw, groceries, tasks, statuses, events, previewChips };
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const guessDue = (raw) => {
  const d = guessDateTime(raw);
  return d ? d.toISOString() : "";
};

const guessDateTime = (raw) => {
  // minimal: tomorrow, today, next <weekday>, at 3pm/15:30
  const lower = raw.toLowerCase();
  const base = new Date();
  let day = null;

  if (/\btomorrow\b/.test(lower)) day = addDays(startOfDay(base), 1);
  else if (/\btoday\b/.test(lower)) day = startOfDay(base);
  else {
    const wd = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const m = lower.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (m){
      const target = wd.indexOf(m[1]);
      const cur = base.getDay();
      let delta = (target - cur + 7) % 7;
      if (delta===0) delta=7;
      day = addDays(startOfDay(base), delta);
    }
  }
  if (!day) return null;

  let hour = 9, minute = 0;
  const t1 = lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (t1){
    hour = parseInt(t1[1],10);
    minute = t1[2] ? parseInt(t1[2],10) : 0;
    const ap = t1[3];
    if (ap){
      if (ap==="pm" && hour<12) hour += 12;
      if (ap==="am" && hour===12) hour = 0;
    }
  }
  day.setHours(hour, minute, 0, 0);
  return day;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getTime() + n*24*3600*1000);
