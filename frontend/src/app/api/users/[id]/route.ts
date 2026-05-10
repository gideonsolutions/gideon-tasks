import { handle, notFound } from "@/server/errors";
import { queryOne } from "@/server/db";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const user = await queryOne<{
      id: string;
      legal_first_name: string;
      trust_level: number;
      created_at: string;
    }>(
      `SELECT id, legal_first_name, trust_level, created_at FROM users WHERE id = $1`,
      [id],
    );
    if (!user) throw notFound("User not found");
    return ok(user);
  });
}
