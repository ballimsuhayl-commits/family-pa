// Rosie – Family Assistant (GitHub Pages, CSP-safe)
// No eval/new Function, no inline scripts, no external CDNs.

const STORAGE_KEY = "rosie.familyPa.v1";

const DEFAULT_STATE = {
  schemaVersion: 1,
  settings: {
    householdName: "Family",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
    reminderLeadMinutes: [10080, 1440, 120], // 7d, 1d, 2h
    quietHours: { start: "21:00", end: "07:00" },
    gemini: { enabled: false, apiKey: "" } // WARNING: BYOK in client is prototype-only
  },
  family: [
    { id: "nasima", name: "Nasima", role: "Admin", isAdmin: true, emoji: "🌷" },
    { id: "suhayl", name: "Suhayl", role: "Admin", isAdmin: true, emoji: "🧭" },
    { id: "rayhaan", name: "Rayhaan", role: "School", isAdmin: false, emoji: "🎒" },
    { id: "zaara", name: "Zaara", role: "School", isAdmin: false, emoji: "🎓" },
    { id: "jabu", name: "Jabu", role: "Helper", isAdmin: false, emoji: "🧺" },
    { id: "lisa", name: "Lisa", role: "Maintenance", isAdmin: false, emoji: "🪴" }
  ],
  status: {
    // memberId: { label, note, updatedAt }
  },
  tasks: [
    // { id, title, assigneeId, dueAt, priority, done, createdAt, notes }
  ],
  groceries: [
    // { id, item, qty, category, done, createdAt }
  ],
  events: [
    // { id, title, startAt, endAt, memberIds, source, notes, createdAt }
  ],
  chat: [
    // { id, role: "user"|"rosie", text, createdAt }
  ],
};

function nowIso() { return new Date().toISOString(); }
function uid(prefix="id") { return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function migrate(s) {
  // Future-proof migrations here.
  if (!s || typeof s !== "object") return structuredClone(DEFAULT_STATE);
  if (!("schemaVersion" in s)) return structuredClone(DEFAULT_STATE);
  return { ...structuredClone(DEFAULT_STATE), ...s };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmtTime(dt) {
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(dt) {
  const d = new Date(dt);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function fmtDateTime(dt) {
  const d = new Date(dt);
  return `${fmtDate(d)} • ${fmtTime(d)}`;
}

function clampStr(s, n=120) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n-1) + "…" : s;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function qs(sel, root=document) { return root.querySelector(sel); }
function qsa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }

function toast(msg) {
  const host = qs("#toast");
  if (!host) return;
  qs("#toastText").textContent = msg;
  host.classList.remove("hidden");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => host.classList.add("hidden"), 3400);
}

function withinQuietHours(date = new Date()) {
  const { start, end } = state.settings.quietHours;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = date.getHours() * 60 + date.getMinutes();
  const sM = sh * 60 + sm;
  const eM = eh * 60 + em;
  if (sM < eM) return mins >= sM && mins < eM;
  // crosses midnight
  return mins >= sM || mins < eM;
}

function computeUpcoming() {
  const now = Date.now();
  const horizon = now + 14 * 24 * 60 * 60 * 1000; // 14 days
  const upcoming = state.events
    .filter(e => e.startAt && new Date(e.startAt).getTime() < horizon && new Date(e.endAt || e.startAt).getTime() > now - 24*60*60*1000)
    .sort((a,b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 12);

  const tasksDue = state.tasks
    .filter(t => !t.done)
    .sort((a,b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity))
    .slice(0, 8);

  return { upcoming, tasksDue };
}

function detectClashes() {
  // Clash = overlapping events sharing at least one member
  const events = state.events
    .filter(e => e.startAt && e.endAt)
    .map(e => ({...e, s: new Date(e.startAt).getTime(), t: new Date(e.endAt).getTime()}))
    .sort((a,b)=>a.s-b.s);

  const clashes = [];
  for (let i=0;i<events.length;i++){
    for (let j=i+1;j<events.length;j++){
      if (events[j].s >= events[i].t) break;
      const a = events[i], b = events[j];
      const shared = (a.memberIds||[]).filter(id => (b.memberIds||[]).includes(id));
      if (shared.length) clashes.push({ a, b, shared });
    }
  }
  return clashes.slice(0, 8);
}

// ---------- ICS import ----------
function parseICSToEvents(text) {
  // Minimal ICS parser for VEVENT blocks.
  // Supports DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION.
  const lines = unfoldICS(text).split(/\r?\n/);
  const events = [];
  let cur = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.DTSTART && cur.SUMMARY) events.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const key = left.split(";")[0].trim().toUpperCase();
    cur[key] = value.trim();
  }

  return events.map(e => ({
    id: uid("evt"),
    title: e.SUMMARY || "Event",
    startAt: icsDateToIso(e.DTSTART),
    endAt: e.DTEND ? icsDateToIso(e.DTEND) : icsDateToIso(e.DTSTART),
    memberIds: [],
    source: "ICS",
    notes: [e.LOCATION ? `📍 ${e.LOCATION}` : "", e.DESCRIPTION ? e.DESCRIPTION : ""].filter(Boolean).join("\n"),
    createdAt: nowIso()
  })).filter(e => e.startAt);
}

function unfoldICS(text) {
  // Lines that start with a space are continuations
  return text.replace(/\r?\n[ \t]/g, "");
}

function icsDateToIso(v) {
  // Handles:
  // - YYYYMMDD
  // - YYYYMMDDTHHMMSSZ
  // - YYYYMMDDTHHMMSS
  if (!v) return "";
  const mDate = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (mDate) {
    const [_, y, mo, d] = mDate;
    const dt = new Date(Number(y), Number(mo)-1, Number(d), 9, 0, 0);
    return dt.toISOString();
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return "";
  const [_, y, mo, d, h, mi, s, z] = m;
  if (z === "Z") return new Date(Date.UTC(+y, +mo-1, +d, +h, +mi, +s)).toISOString();
  return new Date(+y, +mo-1, +d, +h, +mi, +s).toISOString();
}

// ---------- Rosie intelligence ----------
function rosieLocalAnswer(question) {
  const q = question.toLowerCase();
  const { upcoming, tasksDue } = computeUpcoming();
  const clashes = detectClashes();

  if (q.includes("today") || q.includes("agenda") || q.includes("what's on")) {
    const today = new Date();
    const sameDay = (iso) => {
      const d = new Date(iso);
      return d.getFullYear()===today.getFullYear() && d.getMonth()===today.getMonth() && d.getDate()===today.getDate();
    };
    const todays = upcoming.filter(e => sameDay(e.startAt));
    if (!todays.length) return "Today looks clear. Want me to help you plan one priority task?";
    const lines = todays.slice(0,6).map(e => `• ${fmtTime(e.startAt)} — ${e.title}`);
    return `Here’s today:\n${lines.join("\n")}`;
  }

  if (q.includes("clash") || q.includes("conflict") || q.includes("overlap")) {
    if (!clashes.length) return "Good news — I can’t see any clashes right now.";
    const c = clashes[0];
    const who = c.shared.map(id => memberName(id)).join(", ");
    return `I spotted a clash for ${who}:\n• ${fmtDateTime(c.a.startAt)} — ${c.a.title}\n• ${fmtDateTime(c.b.startAt)} — ${c.b.title}\nWant me to help you decide which one to move?`;
  }

  if (q.includes("tasks") || q.includes("chores") || q.includes("to-do")) {
    const open = tasksDue.filter(t => !t.done).slice(0,5);
    if (!open.length) return "No open tasks right now — everything looks handled. 🌷";
    const lines = open.map(t => `• ${t.title}${t.dueAt ? ` (due ${fmtDate(t.dueAt)})` : ""}`);
    return `Here are the next tasks:\n${lines.join("\n")}`;
  }

  if (q.includes("grocery") || q.includes("shopping")) {
    const open = state.groceries.filter(g=>!g.done).slice(0,8);
    if (!open.length) return "Your grocery list is empty. Want me to add staples (milk, eggs, bread) as a starter?";
    const lines = open.map(g => `• ${g.item}${g.qty ? ` ×${g.qty}` : ""}`);
    return `Grocery list:\n${lines.join("\n")}`;
  }

  return "I can help with: today’s agenda, reminders, clashes, groceries, and chores. Try: “Rosie, what’s on today?”";
}

async function rosieGeminiAnswer(question) {
  // PROTOTYPE ONLY: BYOK API keys in browser can be extracted.
  const key = state.settings.gemini.apiKey.trim();
  if (!key) throw new Error("Gemini API key not set.");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;

  // Provide structured context (small, privacy-respecting)
  const { upcoming, tasksDue } = computeUpcoming();
  const context = {
    household: state.settings.householdName,
    upcoming: upcoming.slice(0,10).map(e=>({title:e.title,startAt:e.startAt,endAt:e.endAt,members:e.memberIds?.map(memberName)})),
    tasks: tasksDue.slice(0,10).map(t=>({title:t.title,dueAt:t.dueAt,assignee:memberName(t.assigneeId),done:t.done})),
    groceries: state.groceries.filter(g=>!g.done).slice(0,15).map(g=>({item:g.item,qty:g.qty,category:g.category}))
  };

  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: "You are Rosie, a gentle family assistant. Be brief, kind, and practical. No long lists unless asked." },
        { text: "Context (JSON): " + JSON.stringify(context) },
        { text: "User: " + question }
      ]
    }]
  };

  const res = await fetch(endpoint, {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini error: ${res.status} ${t.slice(0,200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).filter(Boolean).join("\n") || "";
  return text || "I didn’t get a response. Try again.";
}

// ---------- UI ----------
let state = loadState();

function memberName(id){
  return state.family.find(m=>m.id===id)?.name || "Someone";
}

function setHash(route){ location.hash = route; }

function getRoute(){
  const h = (location.hash || "#home").replace("#","");
  return h || "home";
}

function render() {
  saveState();
  const route = getRoute();
  const root = qs("#app");
  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-inner">
        <div class="brand" role="banner">
          <div class="logo" aria-hidden="true"></div>
          <div style="min-width:0">
            <h1>Rosie</h1>
            <span class="sub">${escapeHtml(state.settings.householdName)} • Family Assistant</span>
          </div>
        </div>
        <div class="pill" aria-label="Now">
          <div>
            <strong>${escapeHtml(fmtDate(new Date()))}</strong><br/>
            <small>${escapeHtml(fmtTime(new Date()))}</small>
          </div>
        </div>
      </div>
    </div>

    <div class="container">
      ${route === "home" ? viewHome() : ""}
      ${route === "calendar" ? viewCalendar() : ""}
      ${route === "tasks" ? viewTasks() : ""}
      ${route === "groceries" ? viewGroceries() : ""}
      ${route === "rosie" ? viewRosie() : ""}
      ${route === "settings" ? viewSettings() : ""}
    </div>

    <div class="nav" role="navigation" aria-label="Primary">
      <div class="nav-inner">
        ${navBtn("home","🏠","Home",route)}
        ${navBtn("calendar","📅","Calendar",route)}
        ${navBtn("tasks","✅","Tasks",route)}
        ${navBtn("groceries","🛒","Groceries",route)}
        ${navBtn("rosie","🤖","Rosie",route)}
        ${navBtn("settings","⚙️","Settings",route)}
      </div>
    </div>

    <div id="toast" class="toast hidden" role="status" aria-live="polite">
      <div class="inner">
        <div id="toastText"></div>
        <button type="button" id="toastClose">OK</button>
      </div>
    </div>
  `;

  qs("#toastClose")?.addEventListener("click", ()=>qs("#toast")?.classList.add("hidden"));
  wire(route);
}

function navBtn(route, ico, label, active){
  return `
    <button type="button" data-route="${route}" data-active="${route===active}">
      <div class="ico" aria-hidden="true">${ico}</div>
      <div class="lbl">${label}</div>
    </button>
  `;
}

function viewHome() {
  const { upcoming, tasksDue } = computeUpcoming();
  const clashes = detectClashes();
  const reminder = nextReminder();
  const summary = buildHomeSummary(upcoming, tasksDue, clashes, reminder);

  return `
    <div class="card hero" style="margin-top:14px">
      <div class="face" aria-hidden="true"></div>
      <div class="meta">
        <h2>${escapeHtml(summary.greeting)}</h2>
        <p>${escapeHtml(summary.message)}</p>
        <div class="cta">
          <button class="btn primary" type="button" data-action="quickAdd">➕ Quick add</button>
          <button class="btn" type="button" data-action="askRosie">💬 Ask Rosie</button>
          <button class="btn ghost" type="button" data-action="requestNotify">🔔 Alerts</button>
        </div>
      </div>
    </div>

    <div class="kv card" style="margin-top:12px">
      <div class="tile">
        <div class="k">Next reminder</div>
        <div class="v">${escapeHtml(reminder?.label || "None")}</div>
      </div>
      <div class="tile">
        <div class="k">Open tasks</div>
        <div class="v">${state.tasks.filter(t=>!t.done).length}</div>
      </div>
      <div class="tile">
        <div class="k">Groceries</div>
        <div class="v">${state.groceries.filter(g=>!g.done).length}</div>
      </div>
    </div>

    <div class="section-title">
      <h3>Family status</h3>
      <span class="hint">Tap a chip to update</span>
    </div>
    <div class="card list">
      ${state.family.map(m => statusRow(m)).join("")}
    </div>

    <div class="section-title">
      <h3>Upcoming</h3>
      <span class="hint">Next 14 days</span>
    </div>
    <div class="card list">
      ${upcoming.length ? upcoming.map(e => eventRow(e)).join("") : `<div class="row"><div class="main"><div class="name">No upcoming events</div><div class="subline">Import a school calendar or add one event.</div></div></div>`}
    </div>

    <div class="section-title">
      <h3>Clashes</h3>
      <span class="hint">${clashes.length ? "Fix early" : "All clear"}</span>
    </div>
    <div class="card list">
      ${clashes.length ? clashes.map(c => clashRow(c)).join("") : `<div class="row"><div class="main"><div class="name">No clashes detected</div><div class="subline">Rosie will warn you if anything overlaps.</div></div></div>`}
    </div>
  `;
}

function buildHomeSummary(upcoming, tasksDue, clashes, reminder) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning 🌷" : hour < 18 ? "Good afternoon 🌷" : "Good evening 🌷";

  const parts = [];
  if (reminder) parts.push(`Next up: ${reminder.label}.`);
  if (clashes.length) parts.push(`I found ${clashes.length} clash${clashes.length>1?"es":""} to sort.`);
  const openTasks = tasksDue.filter(t=>!t.done).length;
  if (openTasks) parts.push(`${openTasks} task${openTasks>1?"s":""} waiting.`);
  if (!parts.length) parts.push("Everything looks calm. I’m here if you want to plan ahead.");

  return { greeting, message: parts.join(" ") };
}

function toneForStatus(label){
  const l=(label||"").toLowerCase();
  if (["home","done","ok","available"].includes(l)) return "good";
  if (["busy","school","work","out"].includes(l)) return "warn";
  if (["urgent","help","stuck"].includes(l)) return "bad";
  return "warn";
}

function statusRow(m){
  const s = state.status[m.id] || { label: "Home", note: "", updatedAt: "" };
  const options = m.isAdmin ? ["Home","Busy","Out","Errands"] : ["Home","School","Out","Busy"];
  const chips = options.map(opt => `
    <button class="chip" type="button" data-action="setStatus" data-member="${m.id}" data-status="${opt}"
      data-tone="${toneForStatus(opt)}" data-selected="${s.label===opt}">
      ${escapeHtml(opt)}
    </button>
  `).join("");

  return `
    <div class="row">
      <div class="avatar" aria-hidden="true">${escapeHtml(m.emoji || m.name[0] || "🙂")}</div>
      <div class="main">
        <div class="name">${escapeHtml(m.name)} <span class="badge">${escapeHtml(m.role || "")}</span></div>
        <div class="subline">${escapeHtml(s.note ? clampStr(s.note, 60) : (s.updatedAt ? `Updated ${new Date(s.updatedAt).toLocaleString()}` : "Tap a chip to update."))}</div>
      </div>
      <div class="chips" aria-label="Status">
        ${chips}
      </div>
    </div>
  `;
}

function eventRow(e){
  const members = (e.memberIds||[]).map(memberName).join(", ");
  return `
    <div class="row">
      <div class="avatar" aria-hidden="true">📌</div>
      <div class="main">
        <div class="name">${escapeHtml(e.title)}</div>
        <div class="subline">${escapeHtml(fmtDateTime(e.startAt))}${e.endAt ? `–${escapeHtml(fmtTime(e.endAt))}` : ""}${members ? ` • ${escapeHtml(members)}` : ""}</div>
      </div>
      <button class="btn" type="button" data-action="editEvent" data-id="${escapeHtml(e.id)}">Edit</button>
    </div>
  `;
}

function clashRow(c){
  const who = c.shared.map(memberName).join(", ");
  return `
    <div class="row">
      <div class="avatar" aria-hidden="true">⚠️</div>
      <div class="main">
        <div class="name">${escapeHtml(who)}</div>
        <div class="subline">${escapeHtml(fmtDateTime(c.a.startAt))} • ${escapeHtml(c.a.title)} ⇄ ${escapeHtml(c.b.title)}</div>
      </div>
      <button class="btn" type="button" data-action="viewClash" data-a="${escapeHtml(c.a.id)}" data-b="${escapeHtml(c.b.id)}">Fix</button>
    </div>
  `;
}

function viewCalendar(){
  const events = state.events
    .slice()
    .sort((a,b)=>new Date(a.startAt).getTime()-new Date(b.startAt).getTime())
    .slice(0, 80);

  return `
    <div class="section-title" style="margin-top:14px">
      <h3>Calendar</h3>
      <span class="hint">Import school calendar (.ics)</span>
    </div>

    <div class="card form">
      <div>
        <label class="badge">Import .ics file</label>
        <input class="input" type="file" accept=".ics,text/calendar" data-action="importICS" />
      </div>
      <div class="grid2">
        <button class="btn primary" type="button" data-action="addEvent">➕ Add event</button>
        <button class="btn" type="button" data-action="clearEvents">🧹 Clear calendar</button>
      </div>
      <div style="color:var(--muted); font-size:12px; line-height:1.4">
        Tip: After import, tap an event to attach it to a family member (so Rosie can detect clashes).
      </div>
    </div>

    <div class="section-title">
      <h3>Events</h3>
      <span class="hint">${events.length} showing</span>
    </div>
    <div class="card list">
      ${events.length ? events.map(eventRow).join("") : `<div class="row"><div class="main"><div class="name">No events yet</div><div class="subline">Import a school calendar or add one.</div></div></div>`}
    </div>
  `;
}

function viewTasks(){
  const open = state.tasks.filter(t=>!t.done);
  const done = state.tasks.filter(t=>t.done).slice().sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0, 20);

  return `
    <div class="section-title" style="margin-top:14px">
      <h3>Tasks & chores</h3>
      <span class="hint">For Jabu & Lisa too</span>
    </div>

    <div class="card form">
      <input class="input" placeholder="Add a task (e.g., 'Laundry', 'Garden tidy')" data-field="taskTitle" />
      <div class="grid2">
        <select class="input" data-field="taskAssignee">
          <option value="">Assign to…</option>
          ${state.family.map(m=>`<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("")}
        </select>
        <select class="input" data-field="taskPriority">
          <option value="normal">Priority: normal</option>
          <option value="high">Priority: high</option>
          <option value="low">Priority: low</option>
        </select>
      </div>
      <div class="grid2">
        <input class="input" type="datetime-local" data-field="taskDue" />
        <button class="btn primary" type="button" data-action="addTask">➕ Add task</button>
      </div>
    </div>

    <div class="section-title">
      <h3>Open</h3>
      <span class="hint">${open.length} open</span>
    </div>
    <div class="card list">
      ${open.length ? open.map(taskRow).join("") : `<div class="row"><div class="main"><div class="name">No open tasks</div><div class="subline">Nice — everything is calm.</div></div></div>`}
    </div>

    <div class="section-title">
      <h3>Done</h3>
      <span class="hint">${state.tasks.filter(t=>t.done).length} done</span>
    </div>
    <div class="card list">
      ${done.length ? done.map(taskRow).join("") : `<div class="row"><div class="main"><div class="name">Nothing marked done yet</div><div class="subline">When you complete something, tick it off.</div></div></div>`}
    </div>
  `;
}

function taskRow(t){
  const who = t.assigneeId ? memberName(t.assigneeId) : "Unassigned";
  const due = t.dueAt ? ` • due ${fmtDateTime(t.dueAt)}` : "";
  const tone = t.priority === "high" ? "bad" : t.priority === "low" ? "good" : "warn";
  return `
    <div class="row">
      <button class="chip" type="button" data-action="toggleTask" data-id="${escapeHtml(t.id)}" data-tone="${tone}" aria-label="Toggle task done">
        ${t.done ? "☑" : "☐"}
      </button>
      <div class="main">
        <div class="name">${escapeHtml(t.title)}</div>
        <div class="subline">${escapeHtml(who)}${escapeHtml(due)}${t.priority ? ` • ${escapeHtml(t.priority)}` : ""}</div>
      </div>
      <button class="btn" type="button" data-action="editTask" data-id="${escapeHtml(t.id)}">Edit</button>
    </div>
  `;
}

function viewGroceries(){
  const open = state.groceries.filter(g=>!g.done);
  const done = state.groceries.filter(g=>g.done).slice(0, 30);

  return `
    <div class="section-title" style="margin-top:14px">
      <h3>Groceries</h3>
      <span class="hint">Quick list, low stress</span>
    </div>

    <div class="card form">
      <div class="grid2">
        <input class="input" placeholder="Item (e.g., milk)" data-field="gItem" />
        <input class="input" placeholder="Qty (e.g., 2)" data-field="gQty" />
      </div>
      <div class="grid2">
        <select class="input" data-field="gCat">
          <option value="General">Category: General</option>
          <option value="Fresh">Fresh</option>
          <option value="Dairy">Dairy</option>
          <option value="Bakery">Bakery</option>
          <option value="Household">Household</option>
        </select>
        <button class="btn primary" type="button" data-action="addGrocery">➕ Add</button>
      </div>
      <div class="grid2">
        <button class="btn" type="button" data-action="clearBought">🧹 Clear bought</button>
        <button class="btn" type="button" data-action="exportList">📤 Export</button>
      </div>
    </div>

    <div class="section-title">
      <h3>To buy</h3>
      <span class="hint">${open.length} items</span>
    </div>
    <div class="card list">
      ${open.length ? open.map(groceryRow).join("") : `<div class="row"><div class="main"><div class="name">Nothing to buy</div><div class="subline">Add items as they pop into your head.</div></div></div>`}
    </div>

    <div class="section-title">
      <h3>Bought</h3>
      <span class="hint">${state.groceries.filter(g=>g.done).length} bought</span>
    </div>
    <div class="card list">
      ${done.length ? done.map(groceryRow).join("") : `<div class="row"><div class="main"><div class="name">No bought items</div><div class="subline">Tick items off when you get them.</div></div></div>`}
    </div>
  `;
}

function groceryRow(g){
  return `
    <div class="row">
      <button class="chip" type="button" data-action="toggleGrocery" data-id="${escapeHtml(g.id)}" data-tone="good" aria-label="Toggle grocery bought">
        ${g.done ? "☑" : "☐"}
      </button>
      <div class="main">
        <div class="name">${escapeHtml(g.item)}</div>
        <div class="subline">${escapeHtml(g.category || "General")}${g.qty ? ` • ×${escapeHtml(g.qty)}` : ""}</div>
      </div>
      <button class="btn" type="button" data-action="editGrocery" data-id="${escapeHtml(g.id)}">Edit</button>
    </div>
  `;
}

function viewRosie(){
  const msgs = state.chat.slice(-20);
  return `
    <div class="section-title" style="margin-top:14px">
      <h3>Ask Rosie</h3>
      <span class="hint">Gentle + practical</span>
    </div>

    <div class="card form">
      <div style="color:var(--muted); font-size:12px; line-height:1.4">
        Try: “What’s on today?”, “Any clashes?”, “What should Jabu do next?”, “What groceries are left?”
      </div>
      <div class="card" style="padding:12px; background:rgba(255,255,255,.65)">
        ${msgs.length ? msgs.map(chatBubble).join("") : `<div style="color:var(--muted); font-size:12px">No messages yet.</div>`}
      </div>
      <textarea class="textarea" placeholder="Ask Rosie…" data-field="chatInput"></textarea>
      <div class="grid2">
        <button class="btn primary" type="button" data-action="sendChat">Send</button>
        <button class="btn" type="button" data-action="clearChat">Clear</button>
      </div>
      <div style="color:var(--muted); font-size:12px; line-height:1.4">
        AI mode: ${state.settings.gemini.enabled ? "ON" : "OFF"} (toggle in Settings).
      </div>
    </div>
  `;
}

function chatBubble(m){
  const align = m.role === "user" ? "text-align:right" : "text-align:left";
  const bg = m.role === "user" ? "rgba(79,70,229,.10)" : "rgba(236,72,153,.08)";
  return `
    <div style="${align}; margin:8px 0">
      <div style="display:inline-block; max-width: 92%; background:${bg}; border:1px solid var(--line); border-radius:16px; padding:10px 12px; font-size:13px; line-height:1.35; white-space:pre-wrap">
        ${escapeHtml(m.text)}
      </div>
      <div style="color:var(--muted); font-size:11px; margin-top:4px">${escapeHtml(new Date(m.createdAt).toLocaleString())}</div>
    </div>
  `;
}

function viewSettings(){
  return `
    <div class="section-title" style="margin-top:14px">
      <h3>Settings</h3>
      <span class="hint">Simple, safe, portable</span>
    </div>

    <div class="card form">
      <label class="badge">Household name</label>
      <input class="input" data-field="householdName" value="${escapeHtml(state.settings.householdName)}" />
      <label class="badge">Reminder lead times (minutes, comma-separated)</label>
      <input class="input" data-field="leadMinutes" value="${escapeHtml(state.settings.reminderLeadMinutes.join(","))}" />
      <div class="grid2">
        <div>
          <label class="badge">Quiet hours start</label>
          <input class="input" type="time" data-field="qhStart" value="${escapeHtml(state.settings.quietHours.start)}" />
        </div>
        <div>
          <label class="badge">Quiet hours end</label>
          <input class="input" type="time" data-field="qhEnd" value="${escapeHtml(state.settings.quietHours.end)}" />
        </div>
      </div>

      <div style="border-top:1px solid var(--line); padding-top:10px; margin-top:4px">
        <div class="badge">Gemini (prototype mode)</div>
        <div style="color:var(--muted); font-size:12px; line-height:1.4; margin-top:6px">
          For production, don’t put API keys in a web app. If you enable this here, assume the key could be exposed.
        </div>
        <div class="grid2" style="margin-top:10px">
          <button class="btn" type="button" data-action="toggleGemini">${state.settings.gemini.enabled ? "Disable" : "Enable"} Gemini</button>
          <input class="input" placeholder="Gemini API key" data-field="geminiKey" value="${escapeHtml(state.settings.gemini.apiKey)}" />
        </div>
      </div>

      <div style="border-top:1px solid var(--line); padding-top:10px; margin-top:4px">
        <div class="badge">Family members</div>
        <div class="grid2" style="margin-top:10px">
          <input class="input" placeholder="New member name" data-field="newMemberName" />
          <button class="btn primary" type="button" data-action="addMember">➕ Add member</button>
        </div>
        <div class="card list" style="margin-top:10px">
          ${state.family.map(m => `
            <div class="row">
              <div class="avatar" aria-hidden="true">${escapeHtml(m.emoji || m.name[0])}</div>
              <div class="main">
                <div class="name">${escapeHtml(m.name)} ${m.isAdmin ? '<span class="badge">Admin</span>' : ''}</div>
                <div class="subline">${escapeHtml(m.role || "")}</div>
              </div>
              <button class="btn" type="button" data-action="toggleAdmin" data-id="${escapeHtml(m.id)}">${m.isAdmin ? "Remove admin" : "Make admin"}</button>
              <button class="btn" type="button" data-action="removeMember" data-id="${escapeHtml(m.id)}">Remove</button>
            </div>
          `).join("")}
        </div>
      </div>

      <div style="border-top:1px solid var(--line); padding-top:10px; margin-top:4px">
        <div class="badge">Backup</div>
        <div class="grid2" style="margin-top:10px">
          <button class="btn" type="button" data-action="exportAll">📤 Export JSON</button>
          <button class="btn" type="button" data-action="resetAll">🧨 Reset</button>
        </div>
        <label class="badge" style="margin-top:10px">Import JSON backup</label>
        <input class="input" type="file" accept="application/json" data-action="importAll" />
      </div>
    </div>
  `;
}

function wire(route){
  // nav
  qsa(".nav button").forEach(b=>{
    b.addEventListener("click", ()=> setHash(b.getAttribute("data-route")));
  });

  // shared actions
  qsa("[data-action='setStatus']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const memberId = btn.getAttribute("data-member");
      const status = btn.getAttribute("data-status");
      state.status[memberId] = { label: status, note: state.status[memberId]?.note || "", updatedAt: nowIso() };
      toast(`${memberName(memberId)} is now ${status}.`);
      render();
    });
  });

  // route specific
  if (route === "home") wireHome();
  if (route === "calendar") wireCalendar();
  if (route === "tasks") wireTasks();
  if (route === "groceries") wireGroceries();
  if (route === "rosie") wireRosie();
  if (route === "settings") wireSettings();
}

function wireHome(){
  qs("[data-action='quickAdd']")?.addEventListener("click", ()=> setHash("tasks"));
  qs("[data-action='askRosie']")?.addEventListener("click", ()=> setHash("rosie"));
  qs("[data-action='requestNotify']")?.addEventListener("click", async ()=>{
    try{
      if (!("Notification" in window)) return toast("Notifications not supported here.");
      const perm = await Notification.requestPermission();
      toast(perm === "granted" ? "Alerts enabled." : "Alerts not enabled.");
    }catch{
      toast("Could not request alerts.");
    }
  });

  qsa("[data-action='editEvent']").forEach(btn=>{
    btn.addEventListener("click", ()=> openEventEditor(btn.getAttribute("data-id")));
  });

  qsa("[data-action='viewClash']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const a = btn.getAttribute("data-a"), b = btn.getAttribute("data-b");
      openClashFixer(a,b);
    });
  });
}

function wireCalendar(){
  qs("[data-action='importICS']")?.addEventListener("change", async (ev)=>{
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = parseICSToEvents(text);
    if (!imported.length) return toast("No events found in that file.");
    // Put into calendar; user can attach members later
    state.events = [...imported, ...state.events].slice(0, 500);
    toast(`Imported ${imported.length} events.`);
    render();
  });

  qs("[data-action='addEvent']")?.addEventListener("click", ()=> openEventEditor(null));
  qs("[data-action='clearEvents']")?.addEventListener("click", ()=>{
    if (!confirm("Clear all calendar events?")) return;
    state.events = [];
    toast("Calendar cleared.");
    render();
  });

  qsa("[data-action='editEvent']").forEach(btn=>{
    btn.addEventListener("click", ()=> openEventEditor(btn.getAttribute("data-id")));
  });
}

function wireTasks(){
  const title = qs("[data-field='taskTitle']");
  const assignee = qs("[data-field='taskAssignee']");
  const pr = qs("[data-field='taskPriority']");
  const due = qs("[data-field='taskDue']");
  qs("[data-action='addTask']")?.addEventListener("click", ()=>{
    const t = (title?.value || "").trim();
    if (!t) return toast("Add a task title first.");
    state.tasks.unshift({
      id: uid("tsk"),
      title: t,
      assigneeId: assignee?.value || "",
      dueAt: due?.value ? new Date(due.value).toISOString() : "",
      priority: pr?.value || "normal",
      done: false,
      notes: "",
      createdAt: nowIso()
    });
    title.value=""; due.value="";
    toast("Task added.");
    render();
  });

  qsa("[data-action='toggleTask']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      const t = state.tasks.find(x=>x.id===id);
      if (!t) return;
      t.done = !t.done;
      toast(t.done ? "Marked done." : "Re-opened.");
      render();
    });
  });

  qsa("[data-action='editTask']").forEach(btn=>{
    btn.addEventListener("click", ()=> openTaskEditor(btn.getAttribute("data-id")));
  });
}

function wireGroceries(){
  const item = qs("[data-field='gItem']");
  const qty = qs("[data-field='gQty']");
  const cat = qs("[data-field='gCat']");
  qs("[data-action='addGrocery']")?.addEventListener("click", ()=>{
    const it = (item?.value||"").trim();
    if (!it) return toast("Add an item first.");
    state.groceries.unshift({
      id: uid("gr"),
      item: it,
      qty: (qty?.value||"").trim(),
      category: cat?.value || "General",
      done:false,
      createdAt: nowIso()
    });
    item.value=""; qty.value="";
    toast("Added to groceries.");
    render();
  });

  qsa("[data-action='toggleGrocery']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      const g = state.groceries.find(x=>x.id===id);
      if (!g) return;
      g.done = !g.done;
      render();
    });
  });

  qsa("[data-action='editGrocery']").forEach(btn=>{
    btn.addEventListener("click", ()=> openGroceryEditor(btn.getAttribute("data-id")));
  });

  qs("[data-action='clearBought']")?.addEventListener("click", ()=>{
    state.groceries = state.groceries.filter(g=>!g.done);
    toast("Cleared bought items.");
    render();
  });

  qs("[data-action='exportList']")?.addEventListener("click", ()=>{
    const open = state.groceries.filter(g=>!g.done);
    const txt = open.map(g => `- ${g.item}${g.qty ? ` ×${g.qty}` : ""} (${g.category||"General"})`).join("\n") || "(empty)";
    navigator.clipboard?.writeText(txt).then(()=>toast("Copied to clipboard."), ()=>toast("Could not copy."));
  });
}

function wireRosie(){
  const input = qs("[data-field='chatInput']");
  qs("[data-action='sendChat']")?.addEventListener("click", async ()=>{
    const q = (input?.value||"").trim();
    if (!q) return toast("Type a question first.");
    state.chat.push({ id: uid("m"), role:"user", text:q, createdAt: nowIso() });
    input.value = "";
    render();

    try{
      const useGemini = !!state.settings.gemini.enabled && !!state.settings.gemini.apiKey.trim();
      const ans = useGemini ? await rosieGeminiAnswer(q) : rosieLocalAnswer(q);
      state.chat.push({ id: uid("m"), role:"rosie", text: ans, createdAt: nowIso() });
      render();
    }catch(err){
      state.chat.push({ id: uid("m"), role:"rosie", text: `I couldn’t use Gemini right now. (${err?.message || "error"})\n\nTip: turn off Gemini in Settings to use local Rosie.`, createdAt: nowIso() });
      render();
    }
  });

  qs("[data-action='clearChat']")?.addEventListener("click", ()=>{
    if (!confirm("Clear chat?")) return;
    state.chat = [];
    render();
  });
}

function wireSettings(){
  const hn = qs("[data-field='householdName']");
  const lead = qs("[data-field='leadMinutes']");
  const qhs = qs("[data-field='qhStart']");
  const qhe = qs("[data-field='qhEnd']");
  const key = qs("[data-field='geminiKey']");

  hn?.addEventListener("change", ()=>{ state.settings.householdName = (hn.value||"Family").trim() || "Family"; render(); });
  lead?.addEventListener("change", ()=>{
    const arr = (lead.value||"").split(",").map(x=>parseInt(x.trim(),10)).filter(n=>Number.isFinite(n) && n>0).slice(0,10);
    state.settings.reminderLeadMinutes = arr.length ? arr : DEFAULT_STATE.settings.reminderLeadMinutes;
    render();
  });
  qhs?.addEventListener("change", ()=>{ state.settings.quietHours.start = qhs.value || "21:00"; render(); });
  qhe?.addEventListener("change", ()=>{ state.settings.quietHours.end = qhe.value || "07:00"; render(); });

  qs("[data-action='toggleGemini']")?.addEventListener("click", ()=>{
    state.settings.gemini.enabled = !state.settings.gemini.enabled;
    toast(state.settings.gemini.enabled ? "Gemini enabled (prototype)." : "Gemini disabled.");
    render();
  });
  key?.addEventListener("change", ()=>{
    state.settings.gemini.apiKey = (key.value||"").trim();
    render();
  });

  const nm = qs("[data-field='newMemberName']");
  qs("[data-action='addMember']")?.addEventListener("click", ()=>{
    const name = (nm?.value||"").trim();
    if (!name) return toast("Enter a name first.");
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || uid("m");
    state.family.push({ id, name, role:"Family", isAdmin:false, emoji:"🙂" });
    nm.value="";
    toast("Member added.");
    render();
  });

  qsa("[data-action='toggleAdmin']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      const m = state.family.find(x=>x.id===id);
      if (!m) return;
      m.isAdmin = !m.isAdmin;
      toast(m.isAdmin ? `${m.name} is now admin.` : `${m.name} is no longer admin.`);
      render();
    });
  });

  qsa("[data-action='removeMember']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-id");
      const m = state.family.find(x=>x.id===id);
      if (!m) return;
      if (!confirm(`Remove ${m.name}?`)) return;
      state.family = state.family.filter(x=>x.id!==id);
      delete state.status[id];
      state.tasks.forEach(t=>{ if (t.assigneeId===id) t.assigneeId=""; });
      state.events.forEach(e=>{ e.memberIds = (e.memberIds||[]).filter(mid=>mid!==id); });
      toast("Member removed.");
      render();
    });
  });

  qs("[data-action='exportAll']")?.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rosie-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  qs("[data-action='resetAll']")?.addEventListener("click", ()=>{
    if (!confirm("Reset everything on this device?")) return;
    state = structuredClone(DEFAULT_STATE);
    render();
  });

  qs("[data-action='importAll']")?.addEventListener("change", async (ev)=>{
    const file = ev.target.files?.[0];
    if (!file) return;
    try{
      const txt = await file.text();
      const obj = JSON.parse(txt);
      state = migrate(obj);
      toast("Imported backup.");
      render();
    }catch{
      toast("Could not import that file.");
    }
  });
}

// -------- Modal editors (simple prompt-based to keep UI calm) --------
function openEventEditor(id){
  const isNew = !id;
  const e = isNew ? {
    id: uid("evt"),
    title: "New event",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now()+60*60*1000).toISOString(),
    memberIds: [],
    source: "Manual",
    notes: "",
    createdAt: nowIso()
  } : state.events.find(x=>x.id===id);

  if (!e) return;

  const title = prompt("Event title:", e.title) ?? e.title;
  const start = prompt("Start (YYYY-MM-DDTHH:MM, local time):", toLocalInput(e.startAt)) ?? toLocalInput(e.startAt);
  const end = prompt("End (YYYY-MM-DDTHH:MM, local time):", toLocalInput(e.endAt)) ?? toLocalInput(e.endAt);

  const memberPick = prompt(
    "Attach to members (comma-separated names, optional):",
    (e.memberIds||[]).map(memberName).join(", ")
  ) ?? (e.memberIds||[]).map(memberName).join(", ");

  const memberIds = memberPick.split(",").map(s=>s.trim()).filter(Boolean).map(name=>{
    const m = state.family.find(x=>x.name.toLowerCase()===name.toLowerCase());
    return m?.id;
  }).filter(Boolean);

  const notes = prompt("Notes (optional):", e.notes || "") ?? (e.notes || "");

  e.title = title.trim() || e.title;
  e.startAt = fromLocalInput(start) || e.startAt;
  e.endAt = fromLocalInput(end) || e.endAt;
  e.memberIds = memberIds;
  e.notes = notes;

  if (isNew) state.events.unshift(e);

  toast(isNew ? "Event added." : "Event updated.");
  render();
}

function openClashFixer(aId,bId){
  const a = state.events.find(x=>x.id===aId);
  const b = state.events.find(x=>x.id===bId);
  if (!a || !b) return;

  const choice = prompt(
    `Clash detected.\n1) Move "${a.title}"\n2) Move "${b.title}"\nType 1 or 2:`,
    "1"
  );
  const target = choice === "2" ? b : a;

  const newStart = prompt(`New start for "${target.title}" (YYYY-MM-DDTHH:MM):`, toLocalInput(target.startAt)) ?? toLocalInput(target.startAt);
  const newEnd = prompt(`New end for "${target.title}" (YYYY-MM-DDTHH:MM):`, toLocalInput(target.endAt)) ?? toLocalInput(target.endAt);

  target.startAt = fromLocalInput(newStart) || target.startAt;
  target.endAt = fromLocalInput(newEnd) || target.endAt;

  toast("Clash updated.");
  render();
}

function openTaskEditor(id){
  const t = state.tasks.find(x=>x.id===id);
  if (!t) return;
  const title = prompt("Task title:", t.title) ?? t.title;
  const who = prompt("Assignee name (optional):", t.assigneeId ? memberName(t.assigneeId) : "") ?? (t.assigneeId ? memberName(t.assigneeId) : "");
  const due = prompt("Due (YYYY-MM-DDTHH:MM, optional):", t.dueAt ? toLocalInput(t.dueAt) : "") ?? (t.dueAt ? toLocalInput(t.dueAt) : "");
  const pr = prompt("Priority (low/normal/high):", t.priority || "normal") ?? (t.priority || "normal");

  t.title = title.trim() || t.title;
  t.priority = ["low","normal","high"].includes(pr.trim()) ? pr.trim() : "normal";
  t.dueAt = due.trim() ? (fromLocalInput(due.trim()) || t.dueAt) : "";
  if (who.trim()){
    const m = state.family.find(x=>x.name.toLowerCase()===who.trim().toLowerCase());
    t.assigneeId = m ? m.id : t.assigneeId;
  }
  toast("Task updated.");
  render();
}

function openGroceryEditor(id){
  const g = state.groceries.find(x=>x.id===id);
  if (!g) return;
  const item = prompt("Item:", g.item) ?? g.item;
  const qty = prompt("Qty (optional):", g.qty || "") ?? (g.qty || "");
  const cat = prompt("Category:", g.category || "General") ?? (g.category || "General");
  g.item = item.trim() || g.item;
  g.qty = qty.trim();
  g.category = cat.trim() || "General";
  toast("Updated.");
  render();
}

function toLocalInput(iso){
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v){
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

// -------- Reminder engine (runs while app is open) --------
function nextReminder() {
  const now = Date.now();
  const leads = (state.settings.reminderLeadMinutes||[]).map(m=>m*60*1000);
  const candidates = [];
  for (const e of state.events) {
    if (!e.startAt) continue;
    const start = new Date(e.startAt).getTime();
    if (!Number.isFinite(start)) continue;
    for (const lead of leads) {
      const at = start - lead;
      if (at > now && at < now + 14*24*60*60*1000) {
        candidates.push({ at, label: `${e.title} in ${Math.round(lead/60000)}m`, eventId: e.id });
      }
    }
  }
  candidates.sort((a,b)=>a.at-b.at);
  return candidates[0] || null;
}

async function tickReminders() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  if (withinQuietHours(new Date())) return;

  const now = Date.now();
  const leads = (state.settings.reminderLeadMinutes||[]).map(m=>m*60*1000);

  for (const e of state.events) {
    if (!e.startAt) continue;
    const start = new Date(e.startAt).getTime();
    if (!Number.isFinite(start)) continue;

    for (const lead of leads) {
      const at = start - lead;
      // Fire window: within 1 minute and not already fired
      const key = `rem_${e.id}_${lead}`;
      const fired = state._fired?.[key];
      if (!fired && at <= now && at >= now - 60*1000) {
        state._fired = state._fired || {};
        state._fired[key] = nowIso();
        saveState();
        try{
          new Notification("Rosie reminder", { body: `${e.title} starts at ${fmtTime(e.startAt)}` });
        }catch{}
      }
    }
  }
}

function boot() {
  // Ensure hash default
  if (!location.hash) location.hash = "#home";
  window.addEventListener("hashchange", render);
  render();

  // Periodic reminder check while open
  window.setInterval(tickReminders, 30*1000);

  // SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

boot();
