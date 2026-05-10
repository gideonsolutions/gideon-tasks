import { invalidTransition } from "./errors";

export type TaskStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "completed"
  | "disputed"
  | "resolved"
  | "cancelled"
  | "expired"
  | "rejected";

const ALLOWED: Record<TaskStatus, readonly TaskStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["published", "rejected"],
  published: ["assigned", "cancelled", "expired"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["submitted"],
  submitted: ["completed", "disputed"],
  disputed: ["resolved"],
  completed: [],
  resolved: [],
  cancelled: [],
  expired: [],
  rejected: [],
};

export const TERMINAL: ReadonlySet<TaskStatus> = new Set([
  "completed",
  "resolved",
  "cancelled",
  "expired",
  "rejected",
]);

export function isTerminal(s: TaskStatus): boolean {
  return TERMINAL.has(s);
}

export function transitionTo(from: TaskStatus, to: TaskStatus): TaskStatus {
  if (!ALLOWED[from].includes(to)) {
    throw invalidTransition(`Cannot transition from ${from} to ${to}`);
  }
  return to;
}
