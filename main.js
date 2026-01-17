import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const STORAGE_KEY = "rosie.family-pa.state.v2";

const STATUS_META = {
  ok:   { label: "OK",         emoji: "✅" },
  busy: { label: "Busy",       emoji: "🟣" },
  out:  { label: "Out",        emoji: "🟠" },
  help: { label: "Need help",  emoji: "🆘" },
};

const DEFAULT_MEMBERS = [
  { id: "nasima", name: "Nasima", role: "admin" },
  { id: "suhayl", name: "Suhayl", role: "admin" },
  { id: "rayhaan", name: "Rayhaan", role: "member" },
  { id: "zaara", name: "Zaara", role: "member" },
  { id: "jabu", name: "Jabu", role: "member" },
  { id: "lisa", name: "Lisa", role: "member" },
];

function now() { return Date.now(); }

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParse(raw) : null;
  if (!parsed || !Array.isArray(parsed.members) || typeof parsed.statuses !== "object") {
    return {
      members: DEFAULT_MEMBERS,
      statuses: {},
      tasks: [],
      currentUserId: "nasima",
    };
  }
  // Backward/forward resilience
  return {
    members: parsed.members,
    statuses: parsed.statuses || {},
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    currentUserId: typeof parsed.currentUserId === "string" ? parsed.currentUserId : "nasima",
  };
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

function usePersistedState() {
  const [state, setState] = useState(() => loadState());
  useEffect(() => { saveState(state); }, [state]);
  return [state, setState];
}

function Icon({ children, label }) {
  return React.createElement("span", { className: "navIcon", "aria-label": label, role: "img" }, children);
}

function Button({ className, onClick, children, type="button", disabled=false }) {
  return React.createElement("button", { type, className: cls("btn", className), onClick, disabled }, children);
}

function Chip({ active, onClick, children, title }) {
  return React.createElement(
    "button",
    { type: "button", className: cls("chip", active && "chipActive"), onClick, title },
    children
  );
}

function TextInput({ value, onChange, placeholder }) {
  return React.createElement("input", {
    className: "input",
    value,
    onChange: (e) => onChange(e.target.value),
    placeholder,
  });
}

function Select({ value, onChange, options }) {
  return React.createElement(
    "select",
    { className: "select", value, onChange: (e) => onChange(e.target.value) },
    options.map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label))
  );
}

function RosieCard({ headline, bullets }) {
  return React.createElement(
    "section",
    { className: "rosieCard" },
    React.createElement("div", { className: "rosieTop" },
      React.createElement("div", { className: "brand" },
        React.createElement("div", { className: "mascot", "aria-hidden": "true" }, "🤖"),
        React.createElement("div", null,
          React.createElement("div", { className: "brandTitle" }, "Rosie"),
          React.createElement("div", { className: "brandSub" }, "Family Assistant")
        )
      ),
      React.createElement("div", { className: "pill" }, "Mobile-first")
    ),
    React.createElement("div", { className: "rosieBubble" },
      React.createElement("div", { className: "rosieHeadline" }, headline),
      React.createElement("ul", { className: "rosieList" },
        bullets.map((b, i) => React.createElement("li", { key: i }, b))
      )
    )
  );
}

function computeSummary(members, statuses) {
  const byKey = { ok: 0, busy: 0, out: 0, help: 0 };
  const needsHelp = [];
  for (const m of members) {
    const st = statuses[m.id];
    if (st && byKey[st.key] !== undefined) byKey[st.key] += 1;
    if (st && st.key === "help") needsHelp.push({ m, st });
  }
  needsHelp.sort((a, b) => (b.st.updatedAt || 0) - (a.st.updatedAt || 0));
  const total = members.length;
  const bullets = [];
  bullets.push(`${total} family members in the list.`);
  bullets.push(`${byKey.ok} OK • ${byKey.busy} Busy • ${byKey.out} Out • ${byKey.help} Need help`);
  if (needsHelp.length > 0) {
    const top = needsHelp[0];
    bullets.push(`Priority: ${top.m.name} marked “Need help” at ${formatTime(top.st.updatedAt)}.`);
  } else {
    bullets.push("No one has marked “Need help”.");
  }
  const headline = needsHelp.length > 0 ? "I’m here. Let’s help quickly 💛" : "All calm right now 🌤️";
  return { headline, bullets };
}

function StatusRow({ member, status, canEdit, onSetStatus, onSetNote }) {
  const meta = status ? STATUS_META[status.key] : null;
  const subtitle = status ? `${meta.emoji} ${meta.label} • ${formatTime(status.updatedAt)}` : "No update yet";
  return React.createElement(
    "div",
    { className: "memberRow" },
    React.createElement("div", { className: "avatar", "aria-hidden": "true" }, member.name.slice(0,1).toUpperCase()),
    React.createElement("div", { className: "memberInfo" },
      React.createElement("div", { className: "memberName" },
        member.name,
        member.role === "admin" ? React.createElement("span", { className: "roleBadge" }, "Admin") : null
      ),
      React.createElement("div", { className: "memberSub" }, subtitle),
      status && status.note ? React.createElement("div", { className: "noteLine" }, `“${status.note}”`) : null,
      canEdit ? React.createElement("div", { className: "chipRow" },
        Object.keys(STATUS_META).map((k) => React.createElement(
          Chip,
          {
            key: k,
            active: status && status.key === k,
            onClick: () => onSetStatus(k),
            title: STATUS_META[k].label
          },
          `${STATUS_META[k].emoji} ${STATUS_META[k].label}`
        ))
      ) : null,
      canEdit ? React.createElement("div", { className: "noteRow" },
        React.createElement(TextInput, {
          value: status && status.note ? status.note : "",
          onChange: (v) => onSetNote(v),
          placeholder: "Optional note (e.g., 'Back at 6pm')"
        })
      ) : null
    )
  );
}

function TasksView({ state, setState, currentUser }) {
  const [taskText, setTaskText] = useState("");
  const [assignee, setAssignee] = useState(currentUser.id);

  const options = state.members.map((m) => ({ value: m.id, label: m.name }));
  const canAdd = currentUser.role === "admin" || currentUser.id === assignee;

  function addTask() {
    const text = taskText.trim();
    if (!text) return;
    const t = { id: String(now()) + Math.random().toString(16).slice(2), text, assigneeId: assignee, done: false, createdAt: now() };
    setState({ ...state, tasks: [t, ...state.tasks] });
    setTaskText("");
  }

  function toggleDone(id) {
    setState({ ...state, tasks: state.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) });
  }

  function removeTask(id) {
    setState({ ...state, tasks: state.tasks.filter((t) => t.id !== id) });
  }

  return React.createElement(
    "div",
    { className: "page" },
    React.createElement("h2", { className: "h2" }, "Tasks"),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "fieldRow" },
        React.createElement("label", { className: "label" }, "Assign to"),
        React.createElement(Select, { value: assignee, onChange: setAssignee, options })
      ),
      React.createElement("div", { className: "fieldRow" },
        React.createElement("label", { className: "label" }, "Task"),
        React.createElement(TextInput, { value: taskText, onChange: setTaskText, placeholder: "e.g., Take out bins" })
      ),
      React.createElement(Button, { className: "btnPrimary", onClick: addTask, disabled: !canAdd }, "Add task")
    ),
    React.createElement("div", { className: "list" },
      state.tasks.length === 0
        ? React.createElement("div", { className: "muted" }, "No tasks yet.")
        : state.tasks.map((t) => {
            const m = state.members.find((x) => x.id === t.assigneeId);
            return React.createElement(
              "div",
              { key: t.id, className: cls("taskRow", t.done && "taskDone") },
              React.createElement("div", { className: "taskMain" },
                React.createElement("div", { className: "taskText" }, t.text),
                React.createElement("div", { className: "taskMeta" }, `${m ? m.name : "Unknown"} • ${new Date(t.createdAt).toLocaleDateString()}`)
              ),
              React.createElement("div", { className: "taskActions" },
                React.createElement(Button, { className: "btnGhost", onClick: () => toggleDone(t.id) }, t.done ? "Undo" : "Done"),
                currentUser.role === "admin"
                  ? React.createElement(Button, { className: "btnDanger", onClick: () => removeTask(t.id) }, "Remove")
                  : null
              )
            );
          })
    )
  );
}

function SummaryView({ members, statuses }) {
  const sum = useMemo(() => computeSummary(members, statuses), [members, statuses]);
  return React.createElement(
    "div",
    { className: "page" },
    React.createElement("h2", { className: "h2" }, "Summary"),
    React.createElement(RosieCard, { headline: sum.headline, bullets: sum.bullets }),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "muted" }, "Tip: Use “Need help” for anything urgent. Rosie highlights it here.")
    )
  );
}

function SettingsView({ state, setState, currentUser }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const isAdmin = currentUser.role === "admin";

  function addMember() {
    const n = name.trim();
    if (!n) return;
    const id = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const member = { id: id || ("m-" + String(now())), name: n, role: role === "admin" ? "admin" : "member" };
    setState({ ...state, members: [...state.members, member] });
    setName("");
    setRole("member");
  }

  function removeMember(id) {
    if (id === "nasima" || id === "suhayl") return; // protect core admins
    const members = state.members.filter((m) => m.id !== id);
    const statuses = { ...state.statuses };
    delete statuses[id];
    const tasks = state.tasks.filter((t) => t.assigneeId !== id);
    const nextUserId = state.currentUserId === id ? "nasima" : state.currentUserId;
    setState({ ...state, members, statuses, tasks, currentUserId: nextUserId });
  }

  function exportJson() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rosie-family-pa-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const r = new FileReader();
    r.onload = () => {
      const parsed = safeParse(String(r.result || ""));
      if (!parsed) return;
      if (!Array.isArray(parsed.members) || typeof parsed.statuses !== "object") return;
      setState({
        members: parsed.members,
        statuses: parsed.statuses || {},
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        currentUserId: typeof parsed.currentUserId === "string" ? parsed.currentUserId : "nasima",
      });
    };
    r.readAsText(file);
  }

  function resetAll() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setState(loadState());
  }

  return React.createElement(
    "div",
    { className: "page" },
    React.createElement("h2", { className: "h2" }, "Settings"),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "fieldRow" },
        React.createElement("div", { className: "label" }, "You are"),
        React.createElement(Select, {
          value: state.currentUserId,
          onChange: (v) => setState({ ...state, currentUserId: v }),
          options: state.members.map((m) => ({ value: m.id, label: m.name + (m.role === "admin" ? " (Admin)" : "") }))
        })
      )
    ),
    isAdmin ? React.createElement("div", { className: "card" },
      React.createElement("div", { className: "h3" }, "Family members"),
      React.createElement("div", { className: "fieldRow" },
        React.createElement("label", { className: "label" }, "Name"),
        React.createElement(TextInput, { value: name, onChange: setName, placeholder: "e.g., Grandma" })
      ),
      React.createElement("div", { className: "fieldRow" },
        React.createElement("label", { className: "label" }, "Role"),
        React.createElement(Select, {
          value: role, onChange: setRole,
          options: [{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }]
        })
      ),
      React.createElement(Button, { className: "btnPrimary", onClick: addMember }, "Add member"),
      React.createElement("div", { className: "list" },
        state.members.map((m) => React.createElement(
          "div",
          { key: m.id, className: "memberMini" },
          React.createElement("div", null, m.name, " ", m.role === "admin" ? React.createElement("span", { className: "roleBadge" }, "Admin") : null),
          (m.id === "nasima" || m.id === "suhayl")
            ? React.createElement("span", { className: "muted" }, "Protected")
            : React.createElement(Button, { className: "btnDanger", onClick: () => removeMember(m.id) }, "Remove")
        ))
      )
    ) : React.createElement("div", { className: "card" },
      React.createElement("div", { className: "muted" }, "Only admins can edit the family list.")
    ),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "h3" }, "Backup"),
      React.createElement(Button, { className: "btnGhost", onClick: exportJson }, "Export JSON"),
      React.createElement("label", { className: "fileLabel" },
        "Import JSON",
        React.createElement("input", { type: "file", accept: "application/json", className: "fileInput", onChange: (e) => {
          const f = e.target.files && e.target.files[0];
          if (f) importJson(f);
          e.target.value = "";
        }})
      ),
      React.createElement(Button, { className: "btnDanger", onClick: resetAll }, "Reset everything")
    )
  );
}

function HomeView({ state, setState, currentUser }) {
  const isAdmin = currentUser.role === "admin";
  const summary = useMemo(() => computeSummary(state.members, state.statuses), [state.members, state.statuses]);

  function setMemberStatus(memberId, key) {
    const st = { key, note: state.statuses[memberId]?.note || "", updatedAt: now() };
    setState({ ...state, statuses: { ...state.statuses, [memberId]: st } });
  }
  function setMemberNote(memberId, note) {
    const existing = state.statuses[memberId];
    const st = { key: (existing?.key || "ok"), note, updatedAt: existing?.updatedAt || now() };
    setState({ ...state, statuses: { ...state.statuses, [memberId]: st } });
  }

  return React.createElement(
    "div",
    { className: "page" },
    React.createElement(RosieCard, { headline: summary.headline, bullets: summary.bullets }),
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "fieldRow" },
        React.createElement("div", { className: "label" }, "I am"),
        React.createElement(Select, {
          value: state.currentUserId,
          onChange: (v) => setState({ ...state, currentUserId: v }),
          options: state.members.map((m) => ({ value: m.id, label: m.name + (m.role === "admin" ? " (Admin)" : "") }))
        })
      ),
      React.createElement("div", { className: "muted" },
        isAdmin ? "As an admin, you can update anyone’s status." : "You can update your own status."
      )
    ),
    React.createElement("h2", { className: "h2" }, "Family status"),
    React.createElement("div", { className: "list" },
      state.members.map((m) => {
        const canEdit = isAdmin || m.id === currentUser.id;
        return React.createElement(StatusRow, {
          key: m.id,
          member: m,
          status: state.statuses[m.id],
          canEdit,
          onSetStatus: (k) => setMemberStatus(m.id, k),
          onSetNote: (note) => setMemberNote(m.id, note),
        });
      })
    )
  );
}

function App() {
  const [state, setState] = usePersistedState();
  const currentUser = useMemo(() => state.members.find((m) => m.id === state.currentUserId) || state.members[0] || DEFAULT_MEMBERS[0], [state]);

  const [tab, setTab] = useState("home");

  const content = tab === "home"
    ? React.createElement(HomeView, { state, setState, currentUser })
    : tab === "tasks"
      ? React.createElement(TasksView, { state, setState, currentUser })
      : tab === "summary"
        ? React.createElement(SummaryView, { members: state.members, statuses: state.statuses })
        : React.createElement(SettingsView, { state, setState, currentUser });

  return React.createElement(
    "div",
    { className: "app" },
    React.createElement("header", { className: "topBar" },
      React.createElement("div", { className: "topTitle" }, "Rosie"),
      React.createElement("div", { className: "topSubtitle" }, "Family Assistant")
    ),
    React.createElement("main", { className: "main" }, content),
    React.createElement("nav", { className: "bottomNav" },
      React.createElement("button", { className: cls("navBtn", tab==="home" && "navActive"), onClick: () => setTab("home") },
        React.createElement(Icon, { label: "Home" }, "🏠"), React.createElement("div", { className: "navLabel" }, "Home")
      ),
      React.createElement("button", { className: cls("navBtn", tab==="tasks" && "navActive"), onClick: () => setTab("tasks") },
        React.createElement(Icon, { label: "Tasks" }, "✅"), React.createElement("div", { className: "navLabel" }, "Tasks")
      ),
      React.createElement("button", { className: cls("navBtn", tab==="summary" && "navActive"), onClick: () => setTab("summary") },
        React.createElement(Icon, { label: "Summary" }, "🧾"), React.createElement("div", { className: "navLabel" }, "Summary")
      ),
      React.createElement("button", { className: cls("navBtn", tab==="settings" && "navActive"), onClick: () => setTab("settings") },
        React.createElement(Icon, { label: "Settings" }, "⚙️"), React.createElement("div", { className: "navLabel" }, "Settings")
      )
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
