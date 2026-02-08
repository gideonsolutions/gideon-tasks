import { format, formatDistanceToNow, parseISO } from "date-fns";

/**
 * Format cents as dollar string: 10000 → "$100.00"
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Format an ISO date string to readable format.
 */
export function formatDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

/**
 * Format an ISO date string to date + time.
 */
export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a");
}

/**
 * Format an ISO date string as relative time ("2 hours ago").
 */
export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

/**
 * Format a task status for display: "pending_review" → "Pending Review"
 */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
