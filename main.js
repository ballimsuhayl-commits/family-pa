
import { store, nowIso, uid, fmtWhen, parseIcs, parseVoice, defaultData } from "./app.js";
import { icons } from "./icons.js";

const el = (tag, attrs={}, children=[]) => {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  }
  (children||[]).forEach(c => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
};

const $app = document.getElementById("app");
const toast = el("div",{class:"toast", id:"toast"});
document.body.appendChild(toast);
const showToast = (msg) => {
  toast.textContent = msg;
  toast.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(()=>toast.classList.remove("show"), 2400);
};

// Router (hash)
const routes = [
  { path: "/", label:"Home", icon:"home" },
  { path: "/calendar", label:"Calendar", icon:"calendar" },
  { path: "/tasks", label:"Tasks", icon:"tasks" },
  { path: "/groceries", label:"Groceries", icon:"cart" },
  { path: "/inbox", label:"Inbox", icon:"inbox" },
  { path: "/settings", label:"Settings", icon:"gear" },
];

const getRoute = () => {
  const h = location.hash.replace(/^#/, "") || "/";
  const p = h.startsWith("/") ? h : "/"+h;
  return routes.find(r=>r.path===p) ? p : "/";
};

const nav = () => {
  const path = getRoute();
  return el("nav",{class:"nav"},
    routes.map(r => el("a",{
      href:`.#${r.path}`,
      class: r.path===path ? "active" : ""
    }, [
      el("span",{html:icons[r.icon]}),
      el("span",{},[r.label])
    ]))
  );
};

const topbar = (subtitle) => {
  return el("div",{class:"topbar"},[
    el("div",{class:"brand"},[
      el("div",{class:"rosie", title:"Rosie"},[el("span",{html:icons.rosie})]),
      el("div",{},[
        el("h1",{},["Rosie"]),
        el("div",{class:"badge"},[subtitle || "Family assistant"])
      ])
    ]),
    el("button",{class:"iconbtn", title:"Quick help", onClick:()=>{
      showToast("Tip: Tap 🎙️ and speak naturally. Rosie will sort it for you.");
    }},[el("span",{html:icons.spark})])
  ]);
};

// Voice: Web Speech API (live dictation)
let speech;
let recognizing = false;
let finalText = "";
const canSpeech = () => ("webkitSpeechRecognition" in window) || ("SpeechRecognition" in window);
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

const startSpeech = () => {
  if (!canSpeech()) { showToast("Voice not supported in this browser."); return; }
  if (recognizing) return;
  speech = new SpeechRec();
  speech.continuous = true;
  speech.interimResults = true;
  speech.lang = "en-GB";
  finalText = "";
  recognizing = true;

  speech.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + " ";
      else interim += t;
    }
    render(); // refresh to show live transcript
  };
  speech.onerror = () => { recognizing=false; render(); showToast("Voice error. Try again."); };
  speech.onend = () => { recognizing=false; render(); };
  speech.start();
};
const stopSpeech = () => { if (speech && recognizing) speech.stop(); };

// Audio note recording (stores blobs in memory + localStorage pointers; for small notes only)
let mediaRecorder = null;
let chunks = [];
let recording = false;

const startRecording = async () => {
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e)=>{ if (e.data.size>0) chunks.push(e.data); };
    mediaRecorder.onstop = async ()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      const id = uid();
      // store base64 (small). Large blobs not recommended; we cap to ~1.5MB
      const ab = await blob.arrayBuffer();
      if (ab.byteLength > 1_500_000){
        showToast("Voice note too long. Keep it under ~30s.");
        return;
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      const s = store.get();
      s.voiceNotes = s.voiceNotes || {};
      s.voiceNotes[id] = { b64, mime: blob.type, createdAt: nowIso() };
      s.inbox.unshift({ id: uid(), createdAt: nowIso(), kind:"voice", voiceId:id, text: finalText.trim() || "", status:"new" });
      store.set(s);
      finalText = "";
      showToast("Saved voice note.");
      render();
    };
    mediaRecorder.start();
    recording = true;
    render();
  }catch{
    showToast("Mic permission denied.");
  }
};

const stopRecording = ()=>{
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  recording=false;
};

const applyParsed = (parsed) => {
  const s = store.get();
  const createdAt = nowIso();
  const receipts = [];

  // groceries
  for (const g of parsed.groceries){
    s.groceries.unshift({ id: uid(), item: g, qty:"", category:"General", done:false, createdAt });
    receipts.push(`Added grocery: ${g}`);
  }

  // tasks
  for (const t of parsed.tasks){
    s.tasks.unshift({ id: uid(), title: t.title, assigneeId: t.assigneeId, dueISO: t.dueISO || "", priority: t.priority || "normal", done:false, createdAt });
    const who = s.family.find(f=>f.id===t.assigneeId)?.name || "Someone";
    receipts.push(`Task for ${who}: ${t.title}`);
  }

  // status
  for (const st of parsed.statuses){
    s.status[st.memberId] = { status: st.status, note: st.note || "", updatedAt: createdAt };
    receipts.push(`Set status: ${s.family.find(f=>f.id===st.memberId)?.name || "Member"} → ${st.status}`);
  }

  // events
  for (const ev of parsed.events){
    // clash detection for same owner
    const overlaps = s.events.filter(e=>e.ownerId===ev.ownerId && !(e.endISO<=ev.startISO || e.startISO>=ev.endISO));
    s.events.unshift({ id: uid(), ...ev, createdAt });
    receipts.push(overlaps.length ? `Added event (clash detected): ${ev.title}` : `Added event: ${ev.title}`);
  }

  // inbox note (always)
  s.inbox.unshift({ id: uid(), createdAt, kind:"note", text: parsed.raw, status:"filed", receipts });

  store.set(s);
  showToast(receipts[0] ? receipts[0] : "Rosie sorted it.");
};

const voiceModal = () => {
  const s = store.get();
  const member = s.session.memberId ? s.family.find(f=>f.id===s.session.memberId) : null;

  const transcript = (finalText || "").trim();
  const parsed = parseVoice(transcript, s);

  return el("div",{class:"card"},[
    el("div",{class:"row", style:"justify-content:space-between"},[
      el("div",{},[
        el("div",{class:"h2"},["Tell Rosie"]),
        el("div",{class:"small muted"},[member ? `Listening as ${member.name}` : "Choose who is speaking in Settings"])
      ]),
      el("div",{class:"row"},[
        el("button",{class:"btn", onClick:()=>{ location.hash="#/settings"; }},["Who?"])
      ])
    ]),
    el("div",{class:"col", style:"margin-top:10px"},[
      el("div",{class:"row", style:"gap:8px; flex-wrap:wrap"},[
        el("button",{class:"btn primary", onClick:()=> recognizing ? stopSpeech() : startSpeech()},[recognizing ? "Stop dictation" : "Start dictation"]),
        el("button",{class:"btn", onClick:()=> recording ? stopRecording() : startRecording()},[recording ? "Stop voice note" : "Record voice note"]),
        el("button",{class:"btn", onClick:()=>{ finalText=""; render(); }},["Clear"])
      ]),
      el("textarea",{placeholder:"Or type here… (Rosie will still sort it)", onInput:(e)=>{ finalText = e.target.value; render(); }},[]),
      transcript ? el("div",{class:"card", style:"padding:12px; background:rgba(255,255,255,.70)"},[
        el("div",{class:"h3"},["Rosie heard:"]),
        el("p",{class:"p"},[transcript]),
        el("div",{class:"small muted"},["Auto-sorting preview:"]),
        el("div",{class:"chips"},[
          ...parsed.previewChips.map(c=>el("span",{class:`chip ${c.kind}`},[c.text]))
        ]),
        el("div",{class:"row", style:"margin-top:10px; justify-content:space-between; gap:10px; flex-wrap:wrap"},[
          el("button",{class:"btn primary", onClick:()=>{ applyParsed(parsed); finalText=""; render(); }},["Stop & sort"]),
          el("button",{class:"btn", onClick:()=>{ s.inbox.unshift({ id: uid(), createdAt: nowIso(), kind:"note", text: transcript, status:"new"}); store.set(s); finalText=""; showToast("Saved to Inbox."); render(); }},["Save to inbox only"])
        ])
      ]) : el("div",{class:"small muted"},["Speak like: “Tell Lisa to water the plants tomorrow morning.” or “Buy milk, eggs and fruit.”"])
    ])
  ]);
};

const pageHome = () => {
  const s = store.get();
  const upcoming = s.events
    .filter(e=>new Date(e.endISO) > new Date())
    .sort((a,b)=>a.startISO.localeCompare(b.startISO))
    .slice(0,3);

  const dueTasks = s.tasks.filter(t=>!t.done).slice(0,3);
  const groceryCount = s.groceries.filter(g=>!g.done).length;

  const summary = [
    upcoming.length ? `Next: ${upcoming[0].title} (${fmtWhen(upcoming[0].startISO)})` : "No upcoming events.",
    dueTasks.length ? `${dueTasks.length} active tasks.` : "No active tasks.",
    groceryCount ? `${groceryCount} groceries to buy.` : "Groceries are clear."
  ].join(" ");

  return el("div",{class:"col"},[
    topbar("Make life smooth"),
    el("div",{class:"card hero"},[
      el("div",{class:"rosie"},[el("span",{html:icons.rosie})]),
      el("div",{class:"col"},[
        el("div",{class:"h2"},["Hi Nasima 👋"]),
        el("p",{class:"p muted"},[summary]),
        el("div",{class:"chips"},[
          el("button",{class:"chip ok", onClick:()=>{ location.hash="#/calendar"; }},["Calendar"]),
          el("button",{class:"chip warn", onClick:()=>{ location.hash="#/tasks"; }},["Tasks"]),
          el("button",{class:"chip", onClick:()=>{ location.hash="#/groceries"; }},["Groceries"]),
          el("button",{class:"chip", onClick:()=>{ location.hash="#/inbox"; }},["Inbox"])
        ])
      ])
    ]),
    voiceModal(),
    el("div",{class:"card"},[
      el("div",{class:"row", style:"justify-content:space-between"},[
        el("div",{class:"h2"},["Family status"]),
        el("button",{class:"btn", onClick:()=>{ location.hash="#/settings"; }},["Manage"])
      ]),
      el("div",{class:"list", style:"margin-top:10px"}, s.family.map(m=>{
        const st = s.status[m.id] || { status:"", note:"", updatedAt:"" };
        return el("div",{class:"item"},[
          el("div",{class:"left"},[
            el("div",{class:"avatar"},[m.name.slice(0,1).toUpperCase()]),
            el("div",{},[
              el("div",{class:"name"},[m.name]),
              el("div",{class:"meta"},[st.status ? `${st.status}${st.note ? " • "+st.note : ""}` : "No update yet"])
            ])
          ]),
          el("div",{class:"actions"},[
            el("button",{class:"chip ok", onClick:()=>{ s.status[m.id]={status:"Home", note:"", updatedAt: nowIso()}; store.set(s); render(); }},["Home"]),
            el("button",{class:"chip warn", onClick:()=>{ s.status[m.id]={status:"Busy", note:"", updatedAt: nowIso()}; store.set(s); render(); }},["Busy"]),
            el("button",{class:"chip", onClick:()=>{ s.status[m.id]={status:"Out", note:"", updatedAt: nowIso()}; store.set(s); render(); }},["Out"]),
          ])
        ]);
      }))
    ])
  ]);
};

const pageCalendar = () => {
  const s = store.get();
  const now = new Date();
  const list = s.events
    .filter(e=>new Date(e.endISO) > new Date(now.getTime()-24*3600*1000))
    .sort((a,b)=>a.startISO.localeCompare(b.startISO));

  const fileIcs = async (file) => {
    const text = await file.text();
    const events = parseIcs(text);
    // auto-assign by keywords rules (basic)
    const rules = s.settings.autoAssignRules || [
      { memberName:"Rayhaan", keywords:["rayhaan","yr7","year 7","football","rugby","karate","school"] },
      { memberName:"Zaara", keywords:["zaara","year 11","gcse","netball","school"] }
    ];
    const createdAt = nowIso();
    let added=0, clashes=0;
    for (const ev of events){
      let ownerId = "";
      const hay = (ev.title+" "+(ev.location||"")+" "+(ev.description||"")).toLowerCase();
      for (const r of rules){
        if (r.keywords.some(k=>hay.includes(k.toLowerCase()))){
          const mem = s.family.find(f=>f.name.toLowerCase()===r.memberName.toLowerCase());
          if (mem) { ownerId = mem.id; break; }
        }
      }
      const e2 = {
        id: uid(),
        title: ev.title || "School event",
        startISO: ev.startISO,
        endISO: ev.endISO,
        ownerId,
        notes: ev.location || "",
        source: "ics",
        createdAt
      };
      const overlap = ownerId ? s.events.some(e=>e.ownerId===ownerId && !(e.endISO<=e2.startISO || e.startISO>=e2.endISO)) : false;
      if (overlap) clashes++;
      s.events.unshift(e2);
      added++;
    }
    store.set(s);
    showToast(`Imported ${added} events${clashes?` • ${clashes} clashes`:``}.`);
    render();
  };

  const upcomingReminders = (()=>{
    const leads = s.settings.reminderLeads || [7*24*60, 3*24*60, 24*60, 120];
    const out = [];
    for (const ev of list){
      for (const lm of leads){
        const t = new Date(new Date(ev.startISO).getTime() - lm*60*1000);
        if (t > now && t < new Date(now.getTime()+7*24*3600*1000)){
          out.push({ ev, when: t.toISOString(), lead: lm });
        }
      }
    }
    return out.sort((a,b)=>a.when.localeCompare(b.when)).slice(0,8);
  })();

  return el("div",{class:"col"},[
    topbar("Calendar & reminders"),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Import school calendar"]),
      el("p",{class:"p muted"},["Send Rosie an .ics file and she will auto-fill the calendar and warn you early."]),
      el("div",{class:"row", style:"margin-top:10px; gap:10px; flex-wrap:wrap"},[
        el("input",{type:"file", accept:".ics,text/calendar", class:"input", onChange:(e)=>{ const f=e.target.files?.[0]; if (f) fileIcs(f); }},[]),
      ]),
      el("p",{class:"small muted"},["Auto-assign is rule-based. You can edit rules in Settings."])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Upcoming reminders"]),
      upcomingReminders.length ? el("div",{class:"list", style:"margin-top:10px"}, upcomingReminders.map(r=>{
        const owner = r.ev.ownerId ? s.family.find(f=>f.id===r.ev.ownerId)?.name : "Family";
        const leadTxt = r.lead>=1440 ? `${Math.round(r.lead/1440)}d` : `${r.lead}m`;
        return el("div",{class:"item"},[
          el("div",{class:"left"},[
            el("div",{class:"avatar"},[leadTxt]),
            el("div",{},[
              el("div",{class:"name"},[r.ev.title]),
              el("div",{class:"meta"},[`${owner} • ${fmtWhen(r.ev.startISO)}`])
            ])
          ]),
          el("div",{class:"small muted"},[`Warn: ${fmtWhen(r.when)}`])
        ]);
      })) : el("p",{class:"p muted"},["No reminders in the next 7 days."])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Events"]),
      list.length ? el("div",{class:"list", style:"margin-top:10px"}, list.slice(0,30).map(ev=>{
        const owner = ev.ownerId ? s.family.find(f=>f.id===ev.ownerId)?.name : "Family";
        const overlap = ev.ownerId ? s.events.some(e=>e.id!==ev.id && e.ownerId===ev.ownerId && !(e.endISO<=ev.startISO || e.startISO>=ev.endISO)) : false;
        return el("div",{class:"item"},[
          el("div",{class:"left"},[
            el("div",{class:"avatar"},[owner.slice(0,1).toUpperCase()]),
            el("div",{},[
              el("div",{class:"name"},[ev.title]),
              el("div",{class:"meta"},[`${owner} • ${fmtWhen(ev.startISO)} → ${fmtWhen(ev.endISO)}`])
            ])
          ]),
          el("div",{class:"chips"},[
            overlap ? el("span",{class:"chip bad"},["Clash"]) : el("span",{class:"chip ok"},["OK"])
          ])
        ]);
      })) : el("p",{class:"p muted"},["No events yet. Import an .ics file or tell Rosie."])
    ])
  ]);
};

const pageTasks = () => {
  const s = store.get();
  const addTask = () => {
    const title = (document.getElementById("taskTitle")?.value || "").trim();
    const assigneeId = document.getElementById("taskAssignee")?.value || "";
    const due = document.getElementById("taskDue")?.value || "";
    if (!title) return showToast("Add a task title.");
    s.tasks.unshift({ id: uid(), title, assigneeId, dueISO: due? new Date(due).toISOString():"", priority:"normal", done:false, createdAt: nowIso() });
    store.set(s);
    showToast("Task added.");
    render();
  };
  const list = s.tasks.slice().sort((a,b)=> (a.done===b.done)?0:(a.done?1:-1));
  return el("div",{class:"col"},[
    topbar("Chores & to-dos"),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Add a chore"]),
      el("div",{class:"col", style:"margin-top:10px"},[
        el("input",{id:"taskTitle", class:"input", placeholder:"e.g., Lisa: vacuum lounge"},[]),
        el("div",{class:"row"},[
          el("select",{id:"taskAssignee", class:"input"},[
            el("option",{value:""},["Assign (optional)"]),
            ...s.family.map(f=>el("option",{value:f.id},[f.name]))
          ]),
          el("input",{id:"taskDue", class:"input", type:"datetime-local"},[])
        ]),
        el("button",{class:"btn primary", onClick:addTask},["Add"])
      ])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Tasks"]),
      list.length ? el("div",{class:"list", style:"margin-top:10px"}, list.map(t=>{
        const who = t.assigneeId ? (s.family.find(f=>f.id===t.assigneeId)?.name || "Someone") : "Unassigned";
        const due = t.dueISO ? fmtWhen(t.dueISO) : "No due date";
        return el("div",{class:"item"},[
          el("div",{class:"left"},[
            el("div",{class:"avatar"},[t.done?"✓":"!"]),
            el("div",{},[
              el("div",{class:"name"},[t.title]),
              el("div",{class:"meta"},[`${who} • ${due}`])
            ])
          ]),
          el("div",{class:"actions"},[
            el("button",{class:`chip ${t.done?"ok":"warn"}`, onClick:()=>{ t.done=!t.done; store.set(s); render(); }},[t.done?"Done":"Mark done"]),
            el("button",{class:"chip", onClick:()=>{ s.tasks = s.tasks.filter(x=>x.id!==t.id); store.set(s); render(); }},["Delete"])
          ])
        ]);
      })) : el("p",{class:"p muted"},["No tasks yet. Tell Rosie: “Ask Jabu to take bins out tonight.”"])
    ])
  ]);
};

const pageGroceries = () => {
  const s = store.get();
  const addItem = () => {
    const val = (document.getElementById("gItem")?.value || "").trim();
    if (!val) return showToast("Add an item.");
    s.groceries.unshift({ id: uid(), item: val, qty:"", category:"General", done:false, createdAt: nowIso() });
    store.set(s);
    showToast("Added.");
    render();
  };
  const list = s.groceries.slice().sort((a,b)=> (a.done===b.done)?0:(a.done?1:-1));
  const copyList = () => {
    const txt = list.filter(x=>!x.done).map(x=>`- ${x.item}`).join("\n") || "Groceries are clear.";
    navigator.clipboard?.writeText(txt);
    showToast("Copied.");
  };
  return el("div",{class:"col"},[
    topbar("Groceries"),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Quick add"]),
      el("div",{class:"row", style:"margin-top:10px"},[
        el("input",{id:"gItem", class:"input", placeholder:"e.g., milk"},[]),
        el("button",{class:"btn primary", onClick:addItem},["Add"])
      ]),
      el("div",{class:"row", style:"margin-top:10px; justify-content:space-between"},[
        el("button",{class:"btn", onClick:copyList},["Copy list"]),
        el("button",{class:"btn", onClick:()=>{ s.groceries=s.groceries.filter(x=>!x.done); store.set(s); render(); }},["Clear bought"])
      ])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["List"]),
      list.length ? el("div",{class:"list", style:"margin-top:10px"}, list.map(g=>{
        return el("div",{class:"item"},[
          el("div",{class:"left"},[
            el("div",{class:"avatar"},[g.done?"✓":"🛒"]),
            el("div",{},[
              el("div",{class:"name"},[g.item]),
              el("div",{class:"meta"},[g.category])
            ])
          ]),
          el("div",{class:"actions"},[
            el("button",{class:`chip ${g.done?"ok":"warn"}`, onClick:()=>{ g.done=!g.done; store.set(s); render(); }},[g.done?"Bought":"Mark bought"]),
            el("button",{class:"chip", onClick:()=>{ s.groceries=s.groceries.filter(x=>x.id!==g.id); store.set(s); render(); }},["Delete"])
          ])
        ]);
      })) : el("p",{class:"p muted"},["No groceries. Tell Rosie: “Buy fruit, nappies and bread.”"])
    ])
  ]);
};

const pageInbox = () => {
  const s = store.get();
  const items = s.inbox || [];
  const getAudioUrl = (voiceId) => {
    const v = s.voiceNotes?.[voiceId];
    if (!v) return "";
    const bin = atob(v.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: v.mime });
    return URL.createObjectURL(blob);
  };
  return el("div",{class:"col"},[
    topbar("Inbox"),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Captured thoughts"]),
      el("p",{class:"p muted"},["Rosie saves anything uncertain here. One tap to sort later (or just leave it)."])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Items"]),
      items.length ? el("div",{class:"list", style:"margin-top:10px"}, items.map(it=>{
        const when = fmtWhen(it.createdAt);
        const isVoice = it.kind==="voice";
        return el("div",{class:"item"},[
          el("div",{class:"left"},[
            el("div",{class:"avatar"},[isVoice?"🎙️":"📝"]),
            el("div",{},[
              el("div",{class:"name"},[isVoice?"Voice note":"Note"]),
              el("div",{class:"meta"},[when])
            ])
          ]),
          el("div",{class:"actions"},[
            isVoice ? el("button",{class:"chip", onClick:()=>{
              const url=getAudioUrl(it.voiceId);
              const a=new Audio(url); a.play();
            }},["Play"]) : el("span",{class:"chip"},["View"]),
            el("button",{class:"chip ok", onClick:()=>{
              const text = (it.text || "").trim();
              if (!text) { showToast("No text to sort."); return; }
              const parsed = parseVoice(text, s);
              applyParsed(parsed);
              s.inbox = s.inbox.filter(x=>x.id!==it.id);
              store.set(s);
              render();
            }},["Sort"]),
            el("button",{class:"chip", onClick:()=>{ s.inbox=s.inbox.filter(x=>x.id!==it.id); store.set(s); render(); }},["Delete"])
          ])
        ]);
      })) : el("p",{class:"p muted"},["Inbox is empty."])
    ])
  ]);
};

const pageSettings = () => {
  const s = store.get();
  const saveWho = ()=>{
    const v = document.getElementById("who")?.value || "";
    s.session.memberId = v;
    store.set(s);
    showToast("Saved.");
    render();
  };
  const addMember = ()=>{
    const name = (document.getElementById("newName")?.value||"").trim();
    if (!name) return showToast("Enter a name.");
    s.family.push({ id: uid(), name, role:"", isAdmin:false });
    store.set(s);
    showToast("Added member.");
    render();
  };
  const exportData = ()=>{
    const blob = new Blob([JSON.stringify(store.get(), null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url;
    a.download="rosie-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (file)=>{
    try{
      const text = await file.text();
      const data = JSON.parse(text);
      store.set(data);
      showToast("Imported backup.");
      render();
    }catch{
      showToast("Import failed.");
    }
  };

  return el("div",{class:"col"},[
    topbar("Settings"),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Who is speaking?"]),
      el("p",{class:"p muted"},["Rosie uses this to assign status and events when you speak."]),
      el("div",{class:"row", style:"margin-top:10px"},[
        el("select",{id:"who", class:"input"},[
          el("option",{value:""},["Select…"]),
          ...s.family.map(f=>el("option",{value:f.id, selected: s.session.memberId===f.id ? "" : null},[f.name]))
        ]),
        el("button",{class:"btn primary", onClick:saveWho},["Save"])
      ])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Auto-assign rules (ICS)"]),
      el("p",{class:"p muted"},["Simple keyword rules. Rosie will auto-file school events."]),
      el("textarea",{id:"rules", onInput:(e)=>{ /* live */ }},[]),
      el("div",{class:"row", style:"margin-top:10px; gap:10px; flex-wrap:wrap"},[
        el("button",{class:"btn", onClick:()=>{
          const r = s.settings.autoAssignRules || [];
          document.getElementById("rules").value = JSON.stringify(r.length?r:defaultData().settings.autoAssignRules, null, 2);
        }},["Load rules"]),
        el("button",{class:"btn primary", onClick:()=>{
          try{
            const v = document.getElementById("rules").value.trim();
            if (!v){ showToast("Paste rules JSON first."); return; }
            s.settings.autoAssignRules = JSON.parse(v);
            store.set(s);
            showToast("Rules saved.");
          }catch{ showToast("Rules JSON invalid."); }
        }},["Save rules"])
      ])
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Family members"]),
      el("div",{class:"row", style:"margin-top:10px"},[
        el("input",{id:"newName", class:"input", placeholder:"Add member name"},[]),
        el("button",{class:"btn primary", onClick:addMember},["Add"])
      ]),
      el("div",{class:"list", style:"margin-top:10px"}, s.family.map(f=>el("div",{class:"item"},[
        el("div",{class:"left"},[
          el("div",{class:"avatar"},[f.name.slice(0,1).toUpperCase()]),
          el("div",{},[
            el("div",{class:"name"},[f.name]),
            el("div",{class:"meta"},[f.isAdmin?"Admin":"Member"])
          ])
        ]),
        el("div",{class:"actions"},[
          el("button",{class:"chip", onClick:()=>{
            f.isAdmin=!f.isAdmin; store.set(s); render();
          }},[f.isAdmin?"Remove admin":"Make admin"]),
          el("button",{class:"chip", onClick:()=>{
            if (f.id===s.session.memberId) s.session.memberId="";
            s.family=s.family.filter(x=>x.id!==f.id);
            delete s.status[f.id];
            s.tasks=s.tasks.filter(t=>t.assigneeId!==f.id);
            store.set(s);
            render();
          }},["Remove"])
        ])
      ])))
    ]),
    el("div",{class:"card"},[
      el("div",{class:"h2"},["Backup"]),
      el("div",{class:"row", style:"margin-top:10px; gap:10px; flex-wrap:wrap"},[
        el("button",{class:"btn", onClick:exportData},["Export JSON"]),
        el("input",{type:"file", accept:"application/json", class:"input", onChange:(e)=>{ const f=e.target.files?.[0]; if (f) importData(f);} },[])
      ])
    ])
  ]);
};

const page = () => {
  const path = getRoute();
  if (path==="/") return pageHome();
  if (path==="/calendar") return pageCalendar();
  if (path==="/tasks") return pageTasks();
  if (path==="/groceries") return pageGroceries();
  if (path==="/inbox") return pageInbox();
  if (path==="/settings") return pageSettings();
  return pageHome();
};

const fab = () => el("button",{class:"fab", title:"Tell Rosie", onClick:()=>{
  location.hash="#/";
  // scroll to voice card
  window.scrollTo({top:0, behavior:"smooth"});
}},[el("span",{html:icons.mic})]);

// reminders tick
const tickReminders = () => {
  const s = store.get();
  const now = new Date();
  const leads = s.settings.reminderLeads || [7*24*60, 3*24*60, 24*60, 120];
  s.fired = s.fired || {};
  for (const ev of s.events){
    for (const lm of leads){
      const key = `${ev.id}:${lm}`;
      if (s.fired[key]) continue;
      const t = new Date(new Date(ev.startISO).getTime() - lm*60*1000);
      if (t <= now && new Date(ev.startISO) > now){
        s.fired[key]=nowIso();
        store.set(s);
        showToast(`Reminder: ${ev.title} (${Math.round(lm/60)}h lead)`);
      }
    }
  }
};

const render = () => {
  $app.innerHTML = "";
  $app.appendChild(page());
  $app.appendChild(nav());
  $app.appendChild(fab());
};

window.addEventListener("hashchange", render);
window.addEventListener("storage", render);

store.init();
render();
setInterval(tickReminders, 60*1000);
tickReminders();
