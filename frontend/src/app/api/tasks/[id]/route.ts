import { z } from "zod";
import { handle, notFound, forbidden, badRequest } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { MIN_TASK_PRICE_CENTS } from "@/server/fees";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category_id: z.string().uuid().optional(),
  location_type: z.enum(["in_person", "remote"]).optional(),
  location_address: z.string().optional().nullable(),
  location_lat: z.number().optional().nullable(),
  location_lng: z.number().optional().nullable(),
  price_cents: z.number().int().optional(),
  deadline: z.string().optional(),
});

interface TaskRow {
  id: string;
  requester_id: string;
  title: string;
  description: string;
  category_id: string;
  location_type: string;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  price_cents: number;
  status: string;
  deadline: string;
}

async function fetchTask(id: string): Promise<TaskRow> {
  const t = await queryOne<TaskRow>(`SELECT * FROM tasks WHERE id = $1`, [id]);
  if (!t) throw notFound("Task not found");
  return t;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    return ok(await fetchTask(id));
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await parseBody(req, UpdateSchema);
    const task = await fetchTask(id);

    if (task.requester_id !== auth.userId) throw forbidden("Not your task");
    if (task.status !== "draft") throw badRequest("Can only edit draft tasks");

    const next = {
      title: body.title ?? task.title,
      description: body.description ?? task.description,
      category_id: body.category_id ?? task.category_id,
      location_type: body.location_type ?? task.location_type,
      location_address:
        body.location_address !== undefined
          ? body.location_address
          : task.location_address,
      price_cents: body.price_cents ?? task.price_cents,
      deadline: body.deadline ? new Date(body.deadline) : new Date(task.deadline),
    };

    if (next.price_cents < MIN_TASK_PRICE_CENTS) {
      throw badRequest(
        `Minimum task price is $${(MIN_TASK_PRICE_CENTS / 100).toFixed(2)}`,
      );
    }

    await execute(
      `UPDATE tasks
       SET title=$1, description=$2, category_id=$3, location_type=$4,
           location_address=$5, price_cents=$6, deadline=$7, updated_at=now()
       WHERE id=$8`,
      [
        next.title,
        next.description,
        next.category_id,
        next.location_type,
        next.location_address,
        next.price_cents,
        next.deadline,
        id,
      ],
    );
    return ok(await fetchTask(id));
  });
}
