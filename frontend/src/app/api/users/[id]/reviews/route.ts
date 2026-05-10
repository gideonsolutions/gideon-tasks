import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const rows = await query(
      `SELECT * FROM reviews WHERE reviewee_id = $1 ORDER BY created_at DESC`,
      [id],
    );
    return ok(rows);
  });
}
