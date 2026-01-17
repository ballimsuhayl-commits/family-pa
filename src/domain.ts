export type Role = "admin" | "member";

export type Member = {
  id: string;
  name: string;
  role: Role;
};

export type StatusKey = "ok" | "busy" | "out" | "help";

export type MemberStatus = {
  key: StatusKey;
  note?: string;
  updatedAt: number; // epoch ms
};

export type AppState = {
  members: Member[];
  statuses: Record<string, MemberStatus | undefined>;
};

export const DEFAULT_MEMBERS: Member[] = [
  { id: "nasima", name: "Nasima", role: "admin" },
  { id: "suhayl", name: "Suhayl", role: "admin" },
  { id: "rayhaan", name: "Rayhaan", role: "member" },
  { id: "zaara", name: "Zaara", role: "member" },
  { id: "jabu", name: "Jabu", role: "member" },
  { id: "lisa", name: "Lisa", role: "member" },
];

export function slugId(name: string): string {
  const s = name.trim().toLowerCase();
  const cleaned = s.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return cleaned || crypto.randomUUID();
}

export function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", weekday: "short" });
  } catch {
    return new Date(ts).toISOString();
  }
}

export function statusLabel(key: StatusKey): string {
  switch (key) {
    case "ok":
      return "All good";
    case "busy":
      return "Busy";
    case "out":
      return "Out";
    case "help":
      return "Needs help";
  }
}

export function rosieSummary(state: AppState): { headline: string; bullets: string[] } {
  const total = state.members.length;
  const byKey: Record<StatusKey, number> = { ok: 0, busy: 0, out: 0, help: 0 };

  for (const m of state.members) {
    const st = state.statuses[m.id];
    if (st) byKey[st.key] += 1;
  }

  const needsHelp = state.members
    .map((m) => ({ m, st: state.statuses[m.id] }))
    .filter((x) => x.st?.key === "help")
    .sort((a, b) => (b.st!.updatedAt - a.st!.updatedAt));

  const bullets: string[] = [];
  bullets.push(`${total} family members in the list.`);
  bullets.push(`${byKey.ok} okay • ${byKey.busy} busy • ${byKey.out} out • ${byKey.help} need help`);

  if (needsHelp.length > 0) {
    const top = needsHelp[0];
    bullets.push(`Priority: ${top.m.name} marked “Needs help” at ${formatTime(top.st!.updatedAt)}.`);
  } else {
    bullets.push("No one has marked “Needs help”.");
  }

  const headline = needsHelp.length > 0 ? "I’m here. Let’s help quickly 💛" : "All calm right now 🌤️";
  return { headline, bullets };
}
