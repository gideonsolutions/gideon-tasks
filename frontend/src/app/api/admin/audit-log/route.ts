import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin(req);
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entity_type");
    const entityId = url.searchParams.get("entity_id");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(
      200,
      Number(url.searchParams.get("per_page") ?? 50),
    );
    const offset = (page - 1) * perPage;

    const conds: string[] = [];
    const params: (string | number)[] = [];
    if (entityType) {
      params.push(entityType);
      conds.push(`entity_type = $${params.length}`);
    }
    if (entityId) {
      params.push(entityId);
      conds.push(`entity_id = $${params.length}`);
    }
    params.push(perPage, offset);
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const rows = await query(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return ok(rows);
  });
}
