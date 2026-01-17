import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  AppState,
  Member,
  MemberStatus,
  StatusKey,
  formatTime,
  rosieSummary,
  slugId,
  statusLabel,
} from "./domain";
import { loadState, resetState, saveState } from "./storage";

type Toast = { id: string; msg: string };

function Mascot() {
  return (
    <div className="mascot" aria-hidden="true">
      {/* Simple inline SVG (no external fetch). */}
      <svg width="34" height="34" viewBox="0 0 64 64" role="img" aria-label="Rosie mascot">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(107,92,255,0.9)" />
            <stop offset="1" stopColor="rgba(255,168,214,0.9)" />
          </linearGradient>
        </defs>
        <rect x="10" y="14" width="44" height="40" rx="16" fill="url(#g)" opacity="0.25" />
        <rect x="14" y="18" width="36" height="32" rx="14" fill="white" opacity="0.95" />
        <circle cx="26" cy="34" r="4" fill="#12212f" opacity="0.85" />
        <circle cx="38" cy="34" r="4" fill="#12212f" opacity="0.85" />
        <path d="M24 42c4 4 12 4 16 0" stroke="#12212f" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.65" />
        <path d="M20 22c4-6 20-6 24 0" stroke="rgba(107,92,255,0.45)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function push(msg: string) {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }
  return { toasts, push };
}

function StatusButtons({ onSet }: { onSet: (key: StatusKey) => void }) {
  return (
    <div className="actions" role="group" aria-label="Set status">
      <button className="btn primary" onClick={() => onSet("ok")}>
        ✅ {statusLabel("ok")}
      </button>
      <button className="btn" onClick={() => onSet("busy")}>
        🧠 {statusLabel("busy")}
      </button>
      <button className="btn" onClick={() => onSet("out")}>
        🚗 {statusLabel("out")}
      </button>
      <button className="btn danger" onClick={() => onSet("help")}>
        🆘 {statusLabel("help")}
      </button>
    </div>
  );
}

function MemberRow({
  member,
  status,
  onSetStatus,
  onRemove,
}: {
  member: Member;
  status?: MemberStatus;
  onSetStatus: (id: string, key: StatusKey) => void;
  onRemove: (id: string) => void;
}) {
  const admin = member.role === "admin";
  return (
    <div className="member" aria-label={`${member.name} card`}>
      <div className="left">
        <div className="name">
          <span>{member.name}</span>
          {admin ? <span className="badge" title="Admin">Admin</span> : null}
        </div>
        <div className="status">
          {status ? (
            <>
              <strong>{statusLabel(status.key)}</strong> · updated {formatTime(status.updatedAt)}
              {status.note ? ` · ${status.note}` : ""}
            </>
          ) : (
            <>No status yet</>
          )}
        </div>
      </div>

      <div>
        <StatusButtons onSet={(k) => onSetStatus(member.id, k)} />
        {!admin ? (
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <button className="btn" onClick={() => onRemove(member.id)} aria-label={`Remove ${member.name}`}>
              🗑️ Remove
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState<"all" | "admins" | "members">("all");
  const [voiceUi, setVoiceUi] = useState(false); // UI-only toggle per requirements.
  const { toasts, push } = useToasts();

  useEffect(() => {
    saveState(state);
  }, [state]);

  const summary = useMemo(() => rosieSummary(state), [state]);

  const members = useMemo(() => {
    const list = [...state.members];
    if (filter === "admins") return list.filter((m) => m.role === "admin");
    if (filter === "members") return list.filter((m) => m.role === "member");
    return list;
  }, [state.members, filter]);

  function setStatus(id: string, key: StatusKey) {
    setState((s) => ({
      ...s,
      statuses: { ...s.statuses, [id]: { key, updatedAt: Date.now() } },
    }));
    const member = state.members.find((m) => m.id === id);
    push(`${member?.name ?? "Member"}: ${statusLabel(key)}`);
  }

  function removeMember(id: string) {
    setState((s) => ({
      ...s,
      members: s.members.filter((m) => m.id !== id),
      statuses: Object.fromEntries(Object.entries(s.statuses).filter(([k]) => k !== id)),
    }));
    push("Member removed");
  }

  function addMember() {
    const name = newName.trim();
    if (!name) return;
    const id = slugId(name);
    setState((s) => {
      if (s.members.some((m) => m.id === id || m.name.toLowerCase() === name.toLowerCase())) {
        push("That person is already in the list");
        return s;
      }
      const next: Member = { id, name, role: "member" };
      return { ...s, members: [...s.members, next] };
    });
    setNewName("");
    push("Added to family list");
  }

  function hardReset() {
    resetState();
    setState(loadState());
    push("Reset complete");
  }

  const kpiHelp = Object.values(state.statuses).filter((s) => s?.key === "help").length;
  const kpiSet = Object.values(state.statuses).filter(Boolean).length;

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <Mascot />
          <div className="title">
            <h1>Rosie – Family Assistant</h1>
            <p>Lightweight, friendly, and GitHub Pages–safe.</p>
          </div>
        </div>

        <div className="pill" aria-label="Controls">
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={voiceUi}
              onChange={(e) => setVoiceUi(e.target.checked)}
              aria-label="Voice UI toggle"
            />
            Voice (UI only)
          </label>

          <span className="small" aria-hidden="true">•</span>

          <select
            className="btn"
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            aria-label="Filter members"
          >
            <option value="all">All</option>
            <option value="admins">Admins</option>
            <option value="members">Members</option>
          </select>

          <button className="btn" onClick={hardReset} aria-label="Reset app data">
            ♻️ Reset
          </button>
        </div>
      </header>

      <div className="grid">
        <section className="card" aria-label="Family">
          <div className="row">
            <h2>Family board</h2>
            <span className="small">Tap a status to update.</span>
          </div>

          <div className="familyList">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                status={state.statuses[m.id]}
                onSetStatus={setStatus}
                onRemove={removeMember}
              />
            ))}
          </div>

          <hr className="sep" />

          <div className="row">
            <div>
              <strong>Add a family member</strong>
              <div className="small">Future-safe: not hard-coded.</div>
            </div>
          </div>

          <div className="inputRow">
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Grandma, Cousin, Driver…"
              aria-label="New member name"
              onKeyDown={(e) => {
                if (e.key === "Enter") addMember();
              }}
            />
            <button className="btn primary" onClick={addMember}>
              ➕ Add
            </button>
          </div>

          <div className="footer">
            Tip: everyone can update their own status on any device. (This version stores data locally per browser.)
          </div>
        </section>

        <aside className="card" aria-label="Rosie summary">
          <div className="row">
            <h2>Rosie says</h2>
            <span className="badge">gentle mode</span>
          </div>
          <p style={{ marginTop: 6 }}>
            <strong>{summary.headline}</strong>
          </p>
          <ul>
            {summary.bullets.map((b) => (
              <li key={b} style={{ color: "var(--muted)", marginTop: 6 }}>
                {b}
              </li>
            ))}
          </ul>

          <div className="kpi" aria-label="Quick stats">
            <div className="box">
              <div className="label">Statuses set</div>
              <div className="value">{kpiSet}</div>
            </div>
            <div className="box">
              <div className="label">Need help</div>
              <div className="value">{kpiHelp}</div>
            </div>
          </div>

          <hr className="sep" />

          <p className="small">
            Admins: Nasima & Suhayl. (Role is data-driven; see <code>src/domain.ts</code>.)
          </p>

          {toasts.length > 0 ? (
            <div aria-live="polite" style={{ marginTop: 10 }}>
              {toasts.map((t) => (
                <div key={t.id} className="badge" style={{ display: "inline-block", margin: "6px 6px 0 0" }}>
                  {t.msg}
                </div>
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
