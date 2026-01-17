import { describe, expect, it } from "vitest";
import { DEFAULT_MEMBERS, rosieSummary } from "./domain";

describe("rosieSummary", () => {
  it("creates a stable summary", () => {
    const state = { members: DEFAULT_MEMBERS, statuses: {} };
    const s = rosieSummary(state);
    expect(s.headline.length).toBeGreaterThan(0);
    expect(s.bullets.length).toBeGreaterThan(1);
  });

  it("prioritizes help", () => {
    const now = Date.now();
    const state = {
      members: DEFAULT_MEMBERS,
      statuses: { nasima: { key: "help", updatedAt: now } },
    };
    const s = rosieSummary(state);
    expect(s.headline.toLowerCase()).toContain("help");
  });
});
