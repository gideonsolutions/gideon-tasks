import type { TaskStatus } from "@/lib/types";

/**
 * Port of backend `TaskStatus::transition_to` state machine.
 * Single source of truth for allowed transitions.
 */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["published", "rejected"],
  published: ["assigned", "cancelled", "expired"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["submitted"],
  submitted: ["completed", "disputed"],
  disputed: ["resolved"],
  // Terminal states
  completed: [],
  resolved: [],
  cancelled: [],
  expired: [],
  rejected: [],
};

const TERMINAL_STATUSES: Set<TaskStatus> = new Set([
  "completed",
  "resolved",
  "cancelled",
  "expired",
  "rejected",
]);

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function getAllowedTransitions(status: TaskStatus): TaskStatus[] {
  return TRANSITIONS[status] ?? [];
}

export type UserRole = "requester" | "doer" | "admin";

interface TaskAction {
  label: string;
  targetStatus: TaskStatus;
  variant: "primary" | "danger" | "warning";
}

/**
 * Get available UI actions for a task based on current status and user role.
 */
export function getAvailableActions(
  status: TaskStatus,
  role: UserRole,
): TaskAction[] {
  const actions: TaskAction[] = [];

  switch (status) {
    case "draft":
      if (role === "requester") {
        actions.push({ label: "Publish", targetStatus: "pending_review", variant: "primary" });
      }
      break;
    case "pending_review":
      if (role === "admin") {
        actions.push(
          { label: "Approve", targetStatus: "published", variant: "primary" },
          { label: "Reject", targetStatus: "rejected", variant: "danger" },
        );
      }
      break;
    case "published":
      if (role === "requester") {
        actions.push({ label: "Cancel", targetStatus: "cancelled", variant: "danger" });
      }
      break;
    case "assigned":
      if (role === "doer") {
        actions.push({ label: "Start Work", targetStatus: "in_progress", variant: "primary" });
      }
      if (role === "requester") {
        actions.push({ label: "Cancel", targetStatus: "cancelled", variant: "danger" });
      }
      break;
    case "in_progress":
      if (role === "doer") {
        actions.push({ label: "Submit", targetStatus: "submitted", variant: "primary" });
      }
      break;
    case "submitted":
      if (role === "requester") {
        actions.push(
          { label: "Approve", targetStatus: "completed", variant: "primary" },
          { label: "Dispute", targetStatus: "disputed", variant: "warning" },
        );
      }
      break;
    case "disputed":
      if (role === "admin") {
        actions.push({ label: "Resolve", targetStatus: "resolved", variant: "primary" });
      }
      break;
  }

  return actions;
}

/**
 * Status color mapping for badges.
 */
export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700";
    case "pending_review":
      return "bg-yellow-100 text-yellow-700";
    case "published":
      return "bg-blue-100 text-blue-700";
    case "assigned":
      return "bg-indigo-100 text-indigo-700";
    case "in_progress":
      return "bg-purple-100 text-purple-700";
    case "submitted":
      return "bg-cyan-100 text-cyan-700";
    case "completed":
      return "bg-green-100 text-green-700";
    case "disputed":
      return "bg-orange-100 text-orange-700";
    case "resolved":
      return "bg-green-100 text-green-700";
    case "cancelled":
      return "bg-red-100 text-red-700";
    case "expired":
      return "bg-gray-100 text-gray-500";
    case "rejected":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
