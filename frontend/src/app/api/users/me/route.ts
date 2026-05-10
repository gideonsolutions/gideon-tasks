import { z } from "zod";
import { handle, notFound } from "@/server/errors";
import { execute, queryOne } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { ok, parseBody } from "@/server/route-helpers";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  legal_first_name: z.string().min(1).optional(),
  legal_last_name: z.string().min(1).optional(),
  phone: z.string().optional(),
});

async function fetchUser(id: string) {
  const u = await queryOne<Record<string, unknown> & { password_hash: string }>(
    `SELECT * FROM users WHERE id = $1`,
    [id],
  );
  if (!u) throw notFound("User not found");
  const { password_hash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

export async function GET(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    return ok(await fetchUser(auth.userId));
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const body = await parseBody(req, UpdateSchema);
    const current = await fetchUser(auth.userId);

    await execute(
      `UPDATE users
       SET legal_first_name = $1, legal_last_name = $2, phone = $3, updated_at = now()
       WHERE id = $4`,
      [
        body.legal_first_name ?? (current.legal_first_name as string),
        body.legal_last_name ?? (current.legal_last_name as string),
        body.phone ?? (current.phone as string),
        auth.userId,
      ],
    );

    return ok(await fetchUser(auth.userId));
  });
}
