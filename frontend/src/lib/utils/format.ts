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
 * Format cents as a compact human-readable amount: 250_000 → "$2.5K",
 * 100_000_000 → "$1M", 1_234_567_890 → "$12.3M". Used for headline figures.
 */
export function formatCentsCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    const m = dollars / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    const k = dollars / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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
