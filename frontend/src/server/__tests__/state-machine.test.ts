import { describe, it, expect } from "vitest";
import { transitionTo, isTerminal, type TaskStatus } from "../state-machine";

describe("transitionTo", () => {
  const valid: [TaskStatus, TaskStatus][] = [
    ["draft", "pending_review"],
    ["pending_review", "published"],
    ["pending_review", "rejected"],
    ["published", "assigned"],
    ["published", "cancelled"],
    ["published", "expired"],
    ["assigned", "in_progress"],
    ["assigned", "cancelled"],
    ["in_progress", "submitted"],
    ["submitted", "completed"],
    ["submitted", "disputed"],
    ["disputed", "resolved"],
  ];
  it.each(valid)("allows %s → %s", (from, to) => {
    expect(transitionTo(from, to)).toBe(to);
  });

  const invalid: [TaskStatus, TaskStatus][] = [
    ["draft", "published"],
    ["draft", "completed"],
    ["published", "draft"],
    ["assigned", "published"],
    ["in_progress", "completed"],
    ["completed", "draft"],
    ["resolved", "completed"],
    ["rejected", "draft"],
    ["assigned", "submitted"],
    ["submitted", "cancelled"],
    ["in_progress", "cancelled"],
  ];
  it.each(invalid)("rejects %s → %s", (from, to) => {
    expect(() => transitionTo(from, to)).toThrow();
  });

  it("classifies terminal states", () => {
    for (const s of ["completed", "resolved", "cancelled", "expired", "rejected"] as TaskStatus[]) {
      expect(isTerminal(s)).toBe(true);
    }
    for (const s of ["draft", "pending_review", "published", "assigned", "in_progress", "submitted", "disputed"] as TaskStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });
});
