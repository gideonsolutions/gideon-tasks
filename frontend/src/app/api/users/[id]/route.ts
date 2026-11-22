import { handle, notFound } from "@/server/errors";
import { queryOne } from "@/server/db";
import { ok } from "@/server/route-helpers";
import {
  preparerColumns,
  publicPreparerBadges,
  type PreparerState,
} from "@/server/tax-preparers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const user = await queryOne<
      {
        id: string;
        legal_first_name: string;
        trust_level: number;
        created_at: string;
      } & PreparerState
    >(
      `SELECT id, legal_first_name, trust_level, created_at, ${preparerColumns()}
       FROM users WHERE id = $1`,
      [id],
    );
    if (!user) throw notFound("User not found");
    // Public: the credential and a current-year PTIN badge, never the PTIN.
    return ok({
      id: user.id,
      legal_first_name: user.legal_first_name,
      trust_level: user.trust_level,
      created_at: user.created_at,
      ...publicPreparerBadges(user),
    });
  });
}
