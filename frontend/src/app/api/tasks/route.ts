import { z } from "zod";
import { handle, badRequest, trustLevelInsufficient } from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import { logAudit } from "@/server/audit";
import {
  canPostTasks,
  maxActivePosted,
  maxTaskValueCents,
} from "@/server/trust-levels";
import { MIN_TASK_PRICE_CENTS } from "@/server/fees";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const CreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category_id: z.string().uuid(),
  location_type: z.enum(["in_person", "remote"]),
  location_address: z.string().optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  price_cents: z.number().int(),
  deadline: z.string(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, CreateSchema);

    if (!canPostTasks(auth.trustLevel)) {
      throw trustLevelInsufficient("Trust Level 1 required to post tasks");
    }
    const maxActive = maxActivePosted(auth.trustLevel);
    if (maxActive == null) {
      throw trustLevelInsufficient("Cannot post tasks at this trust level");
    }

    const activeCount = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tasks
       WHERE requester_id = $1 AND status NOT IN ('completed','resolved','cancelled','expired','rejected')`,
      [auth.userId],
    );
    if ((activeCount?.count ?? 0) >= maxActive) {
      throw badRequest(`Maximum active tasks reached (${maxActive})`);
    }

    if (body.price_cents < MIN_TASK_PRICE_CENTS) {
      throw badRequest(
        `Minimum task price is $${(MIN_TASK_PRICE_CENTS / 100).toFixed(2)}`,
      );
    }

    const maxValue = maxTaskValueCents(auth.trustLevel);
    if (body.price_cents > maxValue) {
      throw trustLevelInsufficient(
        `Maximum task value at your trust level is $${(maxValue / 100).toFixed(2)}`,
      );
    }

    const deadline = new Date(body.deadline);
    if (deadline <= new Date()) {
      throw badRequest("Deadline must be in the future");
    }
    if (body.location_type === "in_person" && !body.location_address) {
      throw badRequest("Address required for in-person tasks");
    }

    const taskId = newId();
    await execute(
      `INSERT INTO tasks
        (id, requester_id, title, description, category_id, location_type,
         location_address, location_lat, location_lng, price_cents, status,
         deadline, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,now(),now())`,
      [
        taskId,
        auth.userId,
        body.title,
        body.description,
        body.category_id,
        body.location_type,
        body.location_address ?? null,
        body.location_lat ?? null,
        body.location_lng ?? null,
        body.price_cents,
        deadline,
      ],
    );

    await logAudit(auth.userId, "task.created", "task", taskId, null, {
      title: body.title,
      price_cents: body.price_cents,
    });

    const task = await queryOne(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
    return ok(task, 201);
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const categoryId = url.searchParams.get("category_id");
    const locationType = url.searchParams.get("location_type");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(
      100,
      Number(url.searchParams.get("per_page") ?? 20),
    );
    const offset = (page - 1) * perPage;

    const conds: string[] = [`status = 'published'`];
    const params: (string | number)[] = [];
    if (categoryId) {
      params.push(categoryId);
      conds.push(`category_id = $${params.length}`);
    }
    if (locationType) {
      params.push(locationType);
      conds.push(`location_type = $${params.length}`);
    }
    params.push(perPage, offset);
    const sql = `SELECT * FROM tasks WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = await query(sql, params);
    return ok(rows);
  });
}
