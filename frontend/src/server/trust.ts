import "server-only";
import { execute, queryOne } from "./db";

interface UserAge {
  created_at: string;
  trust_level: number;
}

interface RepRow {
  total_completed: number;
  disputes_lost: number;
  positive_review_rate: number;
}

async function computeLevel(userId: string, adminApprovedL3: boolean): Promise<number> {
  const user = await queryOne<UserAge>(
    `SELECT created_at, trust_level FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) return 0;

  const ageMs = Date.now() - new Date(user.created_at).getTime();
  const ageDays = ageMs / 86_400_000;

  const rep = await queryOne<RepRow>(
    `SELECT total_completed, disputes_lost, positive_review_rate
     FROM reputation_summary WHERE user_id = $1`,
    [userId],
  );
  if (!rep) return 0;

  if (
    adminApprovedL3 &&
    rep.total_completed >= 50 &&
    ageDays >= 180 &&
    rep.positive_review_rate >= 0.95
  ) {
    return 3;
  }
  if (
    rep.total_completed >= 20 &&
    rep.disputes_lost === 0 &&
    ageDays >= 90 &&
    rep.positive_review_rate >= 0.9
  ) {
    return 2;
  }
  if (rep.total_completed >= 5 && rep.disputes_lost === 0 && ageDays >= 30) {
    return 1;
  }
  return 0;
}

export async function updateUserTrustLevel(userId: string): Promise<number> {
  const current = await queryOne<{ trust_level: number }>(
    `SELECT trust_level FROM users WHERE id = $1`,
    [userId],
  );
  const adminApproved = current?.trust_level === 3;
  const level = await computeLevel(userId, adminApproved);
  await execute(
    `UPDATE users SET trust_level = $1, updated_at = now() WHERE id = $2`,
    [level, userId],
  );
  return level;
}
