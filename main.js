// Rosie – Family Assistant (static, CSP-safe, GitHub Pages-safe)
// No eval(), no inline scripts, no build step required.

const STORAGE_KEY = "rosie.family.v1";

const DEFAULT_MEMBERS = [
  { id: "nasima", name: "Nasima", role: "Mum", isAdmin: true, avatar: "👩🏽‍🦱" },
  { id: "suhayl", name: "Suhayl", role: "Dad", isAdmin: true, avatar: "👨🏽" },
  { id: "rayhaan", name: "Rayhaan", role: "Son", isAdmin: false, avatar: "🧒🏽" },
  { id: "zaara", name: "Zaara", role: "Daughter", isAdmin: false, avatar: "👧🏽" },
  { id: "jabu", name: "Jabu", role: "House helper", isAdmin: false, avatar: "🧑🏽‍🍳" },
  { id: "lisa", name: "Lisa", role: "Maintenance & garden", isAdmin: false, avatar: "🧑🏽‍🌾" },
];

const STATUS_OPTIONS = [
  { key: "home", label: "Home", emoji: "🏡", bg: "linear-gradient(180deg,#60d394,#2fb36a)" },
  { key: "work", label: "Work", emoji: "💼", bg: "linear-gradient(180deg,#60a5fa,#2563eb)" },
  { key: "school", label: "School", emoji: "🎒", bg: "linear-gradient(180deg,#fcd34d,#f59e0b)" },
  { key: "out", label: "Out", emoji: "🚗", bg: "linear-gradient(180deg,#fb7185,#f43f5e)" },
  { key: "busy", label: "Busy", emoji: "🟣", bg: "linear-gradient(180deg,#a78bfa,#7c3aed)" },
  { key: "garden", label: "Garden", emoji: "🌿", bg: "linear-gradient(180deg,#2dd4bf,#0ea5a4)" },
];

const TABS = ["home", "tasks", "add", "summary", "settings"];

function nowIso() {
  return new Date().toISOString();
}

function minutesAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 60000);
}

function safeId(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || `m-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.members)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initState() {
  const existing = loadState();
  if (existing) return existing;

  const members = DEFAULT_MEMBERS.map((m) => ({
    ...m,
    status: { key: "home", label: "Home", emoji: "🏡" },
    updatedAt: nowIso(),
  }));

  const state = {
    version: 1,
    currentUserId: "nasima",
    tab: "home",
    members,
    tasks: [
      { id: "t1", text: "Check doors are locked", done: false },
      { id: "t2", text: "Water plants (if needed)", done: false },
      { id: "t3", text: "School bags ready for tomorrow", done: false },
    ],
  };

  saveState(state);
  return state;
}

const state = initState();

const $app = document.getElementById("app");
if (!$app) throw new Error("Missing #app root");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = String(v);
    else if (k.startsWith("aria-")) node.setAttribute(k, String(v));
    else if (k === "html") node.innerHTML = String(v); // used only for trusted inline SVG snippets we control
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k === "disabled") node.disabled = Boolean(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function icon(svgPathD) {
  return el("svg", { class: "ico", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" }, [
    el("path", {
      d: svgPathD,
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  ]);
}

const ICONS = {
  home: "M3 10.5L12 3l9 7.5V21a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 21V10.5Z",
  tasks: "M9 6h12M9 12h12M9 18h12M3.5 6.5l1 1 2-2M3.5 12.5l1 1 2-2M3.5 18.5l1 1 2-2",
  plus: "M12 5v14M5 12h14",
  summary: "M4 19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3l-1-2H8L7 5H6a2 2 0 0 0-2 2v12Z",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.2-2-3.4-2.3.6a7.5 7.5 0 0 0-1.7-1L13 5h-2l-1.5 2a7.5 7.5 0 0 0-1.7 1L5.5 7.4l-2 3.4 2 1.2a7.9 7.9 0 0 0 .1 2l-2 1.2 2 3.4 2.3-.6a7.5 7.5 0 0 0 1.7 1L11 22h2l1.5-2a7.5 7.5 0 0 0 1.7-1l2.3.6 2-3.4-2-1.2Z",
  chevron: "M9 18l6-6-6-6",
};

function getMember(id) {
  return state.members.find((m) => m.id === id) || state.members[0];
}
function isAdmin() {
  return Boolean(getMember(state.currentUserId)?.isAdmin);
}
function statusByKey(key) {
  return STATUS_OPTIONS.find((s) => s.key === key) || STATUS_OPTIONS[0];
}

let sheetBackdrop = null;
let sheet = null;

function closeSheet() {
  sheetBackdrop?.classList.remove("show");
  sheet?.classList.remove("show");
  if (sheet) sheet.innerHTML = "";
}

function openSheet(title, bodyNode) {
  if (!sheetBackdrop) {
    sheetBackdrop = el("div", { class: "backdrop", "aria-hidden": "true" });
    sheetBackdrop.addEventListener("click", closeSheet);
    document.body.appendChild(sheetBackdrop);
  }
  if (!sheet) {
    sheet = el("div", { class: "sheet", role: "dialog", "aria-modal": "true" });
    document.body.appendChild(sheet);
  }

  const header = el("header", {}, [
    el("h3", { text: title }),
    el("button", { type: "button" }, [document.createTextNode("Close")]),
  ]);
  header.querySelector("button")?.addEventListener("click", closeSheet);

  sheet.innerHTML = "";
  sheet.appendChild(header);
  sheet.appendChild(bodyNode);

  sheetBackdrop.classList.add("show");
  sheet.classList.add("show");
}

function setTab(tab) {
  state.tab = tab;
  saveState(state);
  render();
}

function setCurrentUser(id) {
  state.currentUserId = id;
  saveState(state);
  render();
}

function setMemberStatus(memberId, statusKey) {
  const m = state.members.find((x) => x.id === memberId);
  if (!m) return;
  const st = statusByKey(statusKey);
  m.status = { key: st.key, label: st.label, emoji: st.emoji };
  m.updatedAt = nowIso();
  saveState(state);
  render();
}

function addMember({ name, role, avatar, admin }) {
  const id = safeId(name);
  if (state.members.some((m) => m.id === id)) return false;
  state.members.push({
    id,
    name,
    role,
    isAdmin: Boolean(admin),
    avatar: avatar || "🙂",
    status: { key: "home", label: "Home", emoji: "🏡" },
    updatedAt: nowIso(),
  });
  saveState(state);
  return true;
}

function removeMember(id) {
  if (id === "nasima" || id === "suhayl") return false; // protect admins
  const idx = state.members.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  state.members.splice(idx, 1);
  if (state.currentUserId === id) state.currentUserId = "nasima";
  saveState(state);
  return true;
}

function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveState(state);
  render();
}

function rosieSummary() {
  const counts = {};
  for (const m of state.members) {
    const key = m.status?.key || "home";
    counts[key] = (counts[key] || 0) + 1;
  }
  const home = counts.home || 0;
  const out = (counts.out || 0) + (counts.work || 0) + (counts.school || 0);
  const busy = counts.busy || 0;

  let line = `Everyone check-in: ${home} home`;
  if (out) line += `, ${out} away`;
  if (busy) line += `, ${busy} busy`;
  line += ".";

  // Find newest update
  const latest = [...state.members].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const mins = minutesAgo(latest?.updatedAt);
  const latestText = latest ? `${latest.name} updated ${mins === null ? "recently" : mins === 0 ? "just now" : `${mins} min ago`}.` : "";

  return { headline: line, latest: latestText };
}

function renderTopbar() {
  const current = getMember(state.currentUserId);

  const sel = el("select", { "aria-label": "Choose your name" }, []);
  for (const m of state.members) {
    sel.appendChild(el("option", { value: m.id, text: `${m.name}${m.isAdmin ? " (Admin)" : ""}` }));
  }
  sel.value = state.currentUserId;
  sel.addEventListener("change", () => setCurrentUser(sel.value));

  return el("div", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("h1", { text: "Rosie" }),
      el("span", { text: "Family Assistant" }),
    ]),
    el("div", { class: "pill" }, [
      el("span", { text: current.avatar, "aria-hidden": "true" }),
      sel,
    ]),
  ]);
}

function rosieSvg() {
  // Cute robot SVG (tiny, local, CSP-safe)
  return `
  <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rosie">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffd6f5"/>
        <stop offset="1" stop-color="#dbeafe"/>
      </linearGradient>
    </defs>
    <rect x="12" y="16" width="72" height="64" rx="22" fill="url(#g)" stroke="#ffffff" stroke-opacity="0.8"/>
    <rect x="24" y="30" width="48" height="36" rx="18" fill="#111827"/>
    <circle cx="38" cy="48" r="6" fill="#fff"/>
    <circle cx="58" cy="48" r="6" fill="#fff"/>
    <path d="M40 60c4 6 12 6 16 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="12" cy="48" r="10" fill="#fb7185" opacity="0.9"/>
    <circle cx="84" cy="48" r="10" fill="#60a5fa" opacity="0.9"/>
    <path d="M48 12c6 0 10 4 10 10" stroke="#fb7185" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="58" cy="22" r="5" fill="#fb7185"/>
  </svg>`;
}

function renderBanner() {
  const me = getMember(state.currentUserId);
  const { headline, latest } = rosieSummary();

  return el("div", { class: "banner" }, [
    el("div", { class: "rosie", html: rosieSvg() }),
    el("div", {}, [
      el("h2", { text: `Hi ${me.name}!` }),
      el("p", { text: "Here’s the family update:" }),
      el("div", { class: "callout" }, [
        el("strong", { text: headline }),
        el("span", { class: "sparkles", text: "✨" , "aria-hidden":"true"}),
      ]),
      latest ? el("p", { style: { marginTop: "8px" }, text: latest }) : null,
    ]),
  ]);
}

function renderFamilyList() {
  const list = el("div", { class: "list" }, []);

  for (const m of state.members) {
    const st = statusByKey(m.status?.key || "home");
    const mins = minutesAgo(m.updatedAt);
    const meta = mins == null ? "Updated recently" : mins === 0 ? "Updated just now" : `Updated ${mins} min ago`;

    const chip = el("button", {
      class: "chip",
      type: "button",
      "aria-label": `Set status for ${m.name}`,
      style: { background: st.bg },
    }, [`${st.label}`]);

    chip.addEventListener("click", () => {
      openStatusPicker(m);
    });

    const row = el("div", { class: "row" }, [
      el("div", { class: "avatar", "aria-hidden": "true", text: m.avatar || "🙂" }),
      el("div", { class: "namecol" }, [
        el("div", { class: "name", text: m.name }),
        el("div", { class: "meta", text: `${m.role} • ${meta}` }),
      ]),
      el("div", { class: "chips" }, [
        chip,
        el("div", { class: "chev", "aria-hidden": "true", html: `<svg viewBox="0 0 24 24" fill="none"><path d="${ICONS.chevron}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` }),
      ]),
    ]);

    row.addEventListener("click", (e) => {
      // allow clicking row as well, but avoid double when chip clicked
      if (e.target && (e.target.closest("button") || e.target.closest(".chip"))) return;
      openStatusPicker(m);
    });

    list.appendChild(row);
  }

  return el("div", { class: "section" }, [
    el("div", { class: "section-title", text: "Family Status" }),
    el("div", { class: "card" }, [list]),
  ]);
}

function openStatusPicker(member) {
  const grid = el("div", { class: "grid" }, []);
  for (const s of STATUS_OPTIONS) {
    const btn = el("button", { class: "bigbtn", type: "button", style: { background: s.bg } }, [
      el("span", { text: s.emoji, "aria-hidden": "true" }),
      el("span", { text: s.label }),
    ]);
    btn.addEventListener("click", () => {
      setMemberStatus(member.id, s.key);
      closeSheet();
    });
    grid.appendChild(btn);
  }

  openSheet(`Set status: ${member.name}`, grid);
}

function renderTasks() {
  const wrap = el("div", { class: "section" }, [
    el("div", { class: "section-title", text: "Tasks" }),
  ]);

  const card = el("div", { class: "card" }, []);
  const list = el("div", { class: "list" }, []);
  for (const t of state.tasks) {
    const row = el("div", { class: "row" }, [
      el("div", { class: "avatar", "aria-hidden": "true", text: t.done ? "✅" : "⬜️" }),
      el("div", { class: "namecol" }, [
        el("div", { class: "name", text: t.text }),
        el("div", { class: "meta", text: t.done ? "Done" : "Tap to mark done" }),
      ]),
      el("div", { class: "chips" }, [
        el("button", { class: "chip", type: "button", style: { background: t.done ? "linear-gradient(180deg,#94a3b8,#64748b)" : "linear-gradient(180deg,#60d394,#2fb36a)" } }, [t.done ? "Undo" : "Done"]),
      ]),
    ]);
    row.addEventListener("click", () => toggleTask(t.id));
    list.appendChild(row);
  }
  card.appendChild(list);

  wrap.appendChild(card);
  wrap.appendChild(el("div", { class: "notice", style: { marginTop: "12px" } }, [
    "Tip: These tasks are saved on this device only (GitHub Pages has no server).",
  ]));

  return wrap;
}

function renderSummary() {
  const me = getMember(state.currentUserId);
  const admin = isAdmin();

  const { headline, latest } = rosieSummary();

  const wrap = el("div", { class: "section" }, [
    el("div", { class: "section-title", text: "Summary" }),
    el("div", { class: "card" }, [
      el("div", { class: "row" }, [
        el("div", { class: "avatar", "aria-hidden": "true", text: "🤖" }),
        el("div", { class: "namecol" }, [
          el("div", { class: "name", text: `Rosie’s summary for ${me.name}` }),
          el("div", { class: "meta", text: admin ? "Admin view enabled" : "Family view" }),
        ]),
      ]),
      el("div", { style: { padding: "0 12px 14px 12px" } }, [
        el("div", { class: "notice" }, [
          el("div", { text: headline, style: { fontWeight: "900", marginBottom: "6px" } }),
          el("div", { text: latest || "Everyone’s updates are shown on the Home tab." }),
        ]),
        admin ? el("div", { class: "notice", style: { marginTop: "10px" } }, [
          "Admin hint: Use Settings → Manage family to add members. (No server yet, so changes are per-device.)",
        ]) : null,
      ]),
    ]),
  ]);

  return wrap;
}

function renderSettings() {
  const wrap = el("div", { class: "section" }, [
    el("div", { class: "section-title", text: "Settings" }),
  ]);

  const card = el("div", { class: "card" }, []);
  const admin = isAdmin();

  const section1 = el("div", { style: { padding: "12px" } }, [
    el("div", { class: "notice" }, [
      el("div", { style: { fontWeight: "900", marginBottom: "6px" }, text: "About" }),
      el("div", { text: "Rosie is a lightweight family assistant that runs fully on GitHub Pages (no server)." }),
    ]),
  ]);

  card.appendChild(section1);

  if (admin) {
    const manage = el("div", { style: { padding: "12px", borderTop: "1px solid rgba(255,255,255,0.7)" } }, [
      el("div", { class: "notice" }, [
        el("div", { style: { fontWeight: "900", marginBottom: "6px" }, text: "Manage family" }),
        el("div", { text: "Add or remove members (saved on this device)." }),
      ]),
      el("div", { style: { height: "10px" } }),
      el("button", { class: "chip", type: "button", style: { background: "linear-gradient(180deg,#60a5fa,#2563eb)", width: "100%" } }, ["Add member"]),
    ]);

    manage.querySelector("button")?.addEventListener("click", () => openAddMemberSheet());
    card.appendChild(manage);

    const list = el("div", { class: "list" }, []);
    for (const m of state.members) {
      const btn = el("button", { class: "chip", type: "button", style: { background: "linear-gradient(180deg,#fb7185,#f43f5e)" }, disabled: (m.id === "nasima" || m.id === "suhayl") }, [
        (m.id === "nasima" || m.id === "suhayl") ? "Protected" : "Remove",
      ]);
      btn.addEventListener("click", () => {
        if (!confirm(`Remove ${m.name}?`)) return;
        removeMember(m.id);
        render();
      });

      const row = el("div", { class: "row" }, [
        el("div", { class: "avatar", "aria-hidden": "true", text: m.avatar || "🙂" }),
        el("div", { class: "namecol" }, [
          el("div", { class: "name", text: `${m.name}${m.isAdmin ? " (Admin)" : ""}` }),
          el("div", { class: "meta", text: m.role }),
        ]),
        el("div", { class: "chips" }, [btn]),
      ]);
      list.appendChild(row);
    }

    card.appendChild(el("div", { style: { borderTop: "1px solid rgba(255,255,255,0.7)" } }, [list]));
  }

  const danger = el("div", { style: { padding: "12px", borderTop: "1px solid rgba(255,255,255,0.7)" } }, [
    el("div", { class: "notice" }, [
      el("div", { style: { fontWeight: "900", marginBottom: "6px" }, text: "Reset" }),
      el("div", { text: "If things look strange, you can reset this device’s saved data." }),
    ]),
    el("div", { style: { height: "10px" } }),
    el("button", { class: "chip", type: "button", style: { background: "linear-gradient(180deg,#94a3b8,#64748b)", width: "100%" } }, ["Reset this device"]),
  ]);
  danger.querySelector("button")?.addEventListener("click", () => {
    if (!confirm("Reset Rosie data on this device?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  card.appendChild(danger);

  wrap.appendChild(card);
  return wrap;
}

function openAddMemberSheet() {
  const form = el("div", { class: "form" }, []);

  const name = el("input", { class: "input", placeholder: "Name (e.g., Grandma)", inputmode: "text" });
  const role = el("input", { class: "input", placeholder: "Role (e.g., Grandma)", inputmode: "text" });
  const avatar = el("input", { class: "input", placeholder: "Avatar emoji (optional)", inputmode: "text" });

  const adminWrap = el("label", { class: "notice", style: { display: "flex", alignItems: "center", gap: "10px" } }, []);
  const adminChk = el("input", { type: "checkbox" });
  adminWrap.appendChild(adminChk);
  adminWrap.appendChild(el("span", { text: "Make this person an admin" }));

  const addBtn = el("button", {
    class: "bigbtn",
    type: "button",
    style: { background: "linear-gradient(180deg,#60d394,#2fb36a)" },
  }, ["Add member"]);

  addBtn.addEventListener("click", () => {
    const n = name.value.trim();
    const r = role.value.trim();
    const a = avatar.value.trim();
    if (!n || !r) {
      alert("Please enter a name and role.");
      return;
    }
    const ok = addMember({ name: n, role: r, avatar: a, admin: adminChk.checked });
    if (!ok) {
      alert("That member already exists (or name is too similar). Try a different name.");
      return;
    }
    closeSheet();
    render();
  });

  form.appendChild(name);
  form.appendChild(role);
  form.appendChild(avatar);
  form.appendChild(adminWrap);
  form.appendChild(addBtn);

  openSheet("Add a family member", form);
}

function renderNav() {
  const makeBtn = (tab, label, ico, opts = {}) => {
    const btn = el("button", { class: `navbtn ${opts.class || ""}`.trim(), type: "button", "aria-label": label }, []);
    if (opts.plus) {
      btn.classList.add("plus");
      btn.appendChild(icon(ICONS.plus));
      btn.addEventListener("click", () => {
        if (!isAdmin()) {
          alert("Only admins can add new members.");
          return;
        }
        openAddMemberSheet();
      });
      return btn;
    }
    btn.appendChild(icon(ico));
    btn.appendChild(el("span", { text: label }));
    if (state.tab === tab) btn.setAttribute("aria-current", "page");
    btn.addEventListener("click", () => setTab(tab));
    return btn;
  };

  return el("nav", { class: "nav", "aria-label": "Bottom navigation" }, [
    el("div", { class: "nav-inner" }, [
      makeBtn("home", "Home", ICONS.home),
      makeBtn("tasks", "Tasks", ICONS.tasks),
      makeBtn("add", "Add", ICONS.plus, { plus: true }),
      makeBtn("summary", "Summary", ICONS.summary),
      makeBtn("settings", "Settings", ICONS.settings),
    ]),
  ]);
}

function renderMain() {
  if (state.tab === "home") {
    return el("main", {}, [renderBanner(), renderFamilyList()]);
  }
  if (state.tab === "tasks") return el("main", {}, [renderTasks()]);
  if (state.tab === "summary") return el("main", {}, [renderSummary()]);
  if (state.tab === "settings") return el("main", {}, [renderSettings()]);
  // "add" tab is a shortcut; keep home content visible
  state.tab = "home";
  saveState(state);
  return el("main", {}, [renderBanner(), renderFamilyList()]);
}

function render() {
  $app.innerHTML = "";
  $app.appendChild(renderTopbar());
  $app.appendChild(renderMain());
  $app.appendChild(renderNav());
}

render();

// Basic service worker opt-in (disabled by default; GitHub Pages-safe)
// If you later add sw.js, you can enable:
// if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
