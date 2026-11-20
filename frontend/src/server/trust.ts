import "server-only";
import { execute, queryOne } from "./db";
import { computeTrustLevel } from "./trust-levels";

interface UserAge {
  created_at: string;
  trust_level: number;
}

interface RepRow {
  total_completed: number;
  disputes_lost: number;
  positive_review_rate: number;
}

/**
 * Gathers the inputs and applies the rules in ./trust-levels
 * (computeTrustLevel), including the attestation rule: a confirmed,
 * unrevoked attestation from an active attestor halves the completed-task
 * and account-age requirements for level 1 only.
 */
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

  // 'revoked' is its own status, so a confirmed attestation is an unrevoked one.
  const attestation = await queryOne<{ attested: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM attestations a
       JOIN attestors t ON t.id = a.attestor_id
       WHERE a.user_id = $1 AND a.status = 'confirmed' AND t.status = 'active'
     ) AS attested`,
    [userId],
  );

  return computeTrustLevel({
    totalCompleted: Number(rep.total_completed),
    disputesLost: Number(rep.disputes_lost),
    positiveReviewRate: Number(rep.positive_review_rate),
    accountAgeDays: ageDays,
    hasConfirmedAttestation: attestation?.attested === true,
    adminApprovedLevel3: adminApprovedL3,
  });
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
