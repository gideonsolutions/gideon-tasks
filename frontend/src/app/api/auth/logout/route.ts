import { handle } from "@/server/errors";
import { execute } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    await execute(`DELETE FROM refresh_tokens WHERE user_id = $1`, [
      auth.userId,
    ]);
    await logAudit(auth.userId, "user.logout", "user", auth.userId, null, null);
    return ok({ message: "Logged out" });
  });
}
