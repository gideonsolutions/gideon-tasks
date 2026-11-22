import { z } from "zod";
import { handle, notFound, badRequest } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";

export const runtime = "nodejs";

// An admin records a background check after reviewing the provider's report,
// or clears it. No provider is integrated: this is the only way a check is
// recorded. Only users with a recorded check may apply to, ask about or be
// assigned tutoring for a child (src/server/minor-safeguards.ts).

const note = z.string().trim().min(1, "Add a short note").max(500);

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    note,
    /** The admin confirms the report shows the person's identity and that they are 18 or older. */
    confirms_identity_and_adult: z.literal(true, {
      message: "Confirm that the report shows this person's identity and that they are 18 or older",
    }),
  }),
  z.object({ action: z.literal("clear"), note }),
]);

interface Row {
  id: string;
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  status: string;
  background_check_cleared_at: string | null;
  background_check_note: string | null;
}

const COLUMNS = `id, legal_first_name, legal_last_name, email, status,
  background_check_cleared_at, background_check_note`;

async function userId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) throw badRequest("Not a user ID");
  return id;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireAdmin(req);
    const id = await userId(params);
    const row = await queryOne<Row>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    if (!row) throw notFound("User not found");
    return ok(row);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    const id = await userId(params);
    const body = await parseBody(req, BodySchema);

    const before = await queryOne<Row>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    if (!before) throw notFound("User not found");

    const after = await queryOne<Row>(
      body.action === "record"
        ? `UPDATE users SET background_check_cleared_at = now(),
             background_check_note = $1, updated_at = now()
           WHERE id = $2 RETURNING ${COLUMNS}`
        : `UPDATE users SET background_check_cleared_at = NULL,
             background_check_note = $1, updated_at = now()
           WHERE id = $2 RETURNING ${COLUMNS}`,
      [body.note, id],
    );
    if (!after) throw notFound("User not found");

    await logAudit(
      admin.userId,
      body.action === "record"
        ? "admin.user.background_check_recorded"
        : "admin.user.background_check_cleared",
      "user",
      id,
      {
        background_check_cleared_at: before.background_check_cleared_at,
        background_check_note: before.background_check_note,
      },
      {
        background_check_cleared_at: after.background_check_cleared_at,
        background_check_note: after.background_check_note,
      },
    );
    return ok(after);
  });
}
