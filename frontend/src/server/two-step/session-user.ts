import "server-only";
import { queryOne } from "../db";
import { notFound } from "../errors";

/** What issueSession needs about a user. */
export async function sessionUser(userId: string) {
  const u = await queryOne<{ id: string; is_admin: boolean; trust_level: number }>(
    `SELECT id, is_admin, trust_level FROM users WHERE id = $1`,
    [userId],
  );
  if (!u) throw notFound("User not found");
  return u;
}
