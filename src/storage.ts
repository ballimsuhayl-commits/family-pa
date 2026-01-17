import { AppState, DEFAULT_MEMBERS } from "./domain";

const KEY = "rosie.family-pa.state.v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { members: DEFAULT_MEMBERS, statuses: {} };
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.members) || typeof parsed.statuses !== "object") {
      return { members: DEFAULT_MEMBERS, statuses: {} };
    }
    return parsed;
  } catch {
    return { members: DEFAULT_MEMBERS, statuses: {} };
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode errors
  }
}

export function resetState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
