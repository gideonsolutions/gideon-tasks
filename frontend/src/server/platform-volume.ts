import "server-only";
import { queryOne } from "./db";

/**
 * Cumulative platform volume = sum of task prices for payments that have been
 * captured (escrowed) or released. Excludes pending/failed/refunded.
 */
export async function platformVolumeCents(): Promise<number> {
  const row = await queryOne<{ sum: string | null }>(
    `SELECT COALESCE(SUM(task_price_cents), 0)::text AS sum
     FROM payments WHERE status IN ('escrowed', 'released')`,
  );
  return Number(row?.sum ?? 0);
}
