import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { env } from "./env";

neonConfig.fetchConnectionCache = true;

// Created on the first query, so that importing this module (as `next build` does) needs no DATABASE_URL.
let client: ReturnType<typeof neon> | null = null;
const sqlClient = () => (client ??= neon(env.databaseUrl));

export type SqlValue = string | number | boolean | null | Date | Buffer | object;

export async function query<T = Record<string, unknown>>(
  text: string,
  params: SqlValue[] = [],
): Promise<T[]> {
  const rows = await sqlClient().query(text, params);
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
  await sqlClient().query(text, params);
}
