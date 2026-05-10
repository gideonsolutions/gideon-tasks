import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { env } from "./env";

neonConfig.fetchConnectionCache = true;

const sqlClient = neon(env.databaseUrl);

export type SqlValue = string | number | boolean | null | Date | Buffer | object;

export async function query<T = Record<string, unknown>>(
  text: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const rows = await sqlClient.query(text, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: SqlValue[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function execute(
  text: string,
  params: SqlValue[] = [],
): Promise<void> {
  await sqlClient.query(text, params);
}
