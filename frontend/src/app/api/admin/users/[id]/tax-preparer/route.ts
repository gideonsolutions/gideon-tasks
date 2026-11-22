import { z } from "zod";
import { handle, notFound, badRequest, conflict } from "@/server/errors";
import { queryOne } from "@/server/db";
import { requireAdmin } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import {
  normalizePtin,
  recordablePtinYears,
  TAX_CREDENTIALS,
  utcYear,
} from "@/server/tax-preparers";

export const runtime = "nodejs";

// An admin records a tasker's PTIN for the calendar year it was verified for,
// and their credential (Enrolled Agent, CPA or attorney), or clears either.
// No lookup is integrated: the admin checks the IRS Directory of Federal Tax
// Return Preparers with Credentials and Select Qualifications
// (https://irs.treasury.gov/rpo/rpo.jsf) and, for a CPA, the state board.
// A PTIN recorded for the current calendar year (UTC) or later lets a user
// take Tax Prep tasks. From December 1 (New York time) next year's PTIN may
// be recorded too, as a renewal of one that is also active this year
// (src/server/tax-preparers.ts). Every change is audited.

const note = z.string().trim().min(1, "Add a short note").max(500);

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record_ptin"),
    ptin: z.string(),
    /** The calendar year the PTIN was verified for: one of recordablePtinYears(). */
    year: z.number().int(),
    /**
     * Required for next year's PTIN: it is a renewal, and the PTIN is also
     * active this year (a new PTIN for next year isn't valid until January 1).
     */
    confirms_renewal_active_this_year: z.literal(true).optional(),
    note,
    /** The admin confirms the PTIN is current for that year and belongs to this person. */
    confirms_current_ptin: z.literal(true, {
      message: "Confirm that the PTIN is current for this year and belongs to this person",
    }),
  }),
  z.object({ action: z.literal("clear_ptin"), note }),
  z.object({
    action: z.literal("record_credential"),
    credential: z.enum(TAX_CREDENTIALS as [string, ...string[]]),
    note,
    /** The admin confirms the credential is current and belongs to this person. */
    confirms_credential: z.literal(true, {
      message: "Confirm that the credential is current and belongs to this person",
    }),
  }),
  z.object({ action: z.literal("clear_credential"), note }),
]);

interface Row {
  id: string;
  legal_first_name: string;
  legal_last_name: string;
  email: string;
  status: string;
  ptin: string | null;
  ptin_year: number | null;
  ptin_note: string | null;
  ptin_recorded_at: string | null;
  ptin_recorded_by: string | null;
  tax_credential: string | null;
  tax_credential_note: string | null;
  tax_credential_recorded_at: string | null;
  tax_credential_recorded_by: string | null;
}

const COLUMNS = `id, legal_first_name, legal_last_name, email, status,
  ptin, ptin_year, ptin_note, ptin_recorded_at, ptin_recorded_by,
  tax_credential, tax_credential_note, tax_credential_recorded_at, tax_credential_recorded_by`;

const PTIN_FIELDS = ["ptin", "ptin_year", "ptin_note", "ptin_recorded_at", "ptin_recorded_by"] as const;
const CREDENTIAL_FIELDS = [
  "tax_credential",
  "tax_credential_note",
  "tax_credential_recorded_at",
  "tax_credential_recorded_by",
] as const;

function pick(row: Row, fields: readonly (keyof Row)[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f, row[f]]));
}

/** The record, plus the years a PTIN may be recorded for now. */
function view(row: Row) {
  return { ...row, current_year: utcYear(), recordable_years: recordablePtinYears() };
}

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
    return ok(view(row));
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

    let after: Row | null;
    switch (body.action) {
      case "record_ptin": {
        const ptin = normalizePtin(body.ptin);
        if (!ptin) throw badRequest("A PTIN is the letter P followed by eight digits");
        const year = body.year;
        const allowed = recordablePtinYears();
        if (!allowed.includes(year)) {
          throw badRequest(
            allowed.length > 1
              ? `A PTIN can be recorded for ${allowed.join(" or ")} only`
              : `Only a PTIN for the current calendar year (${allowed[0]}) can be recorded. Next year's can be recorded from December 1`,
          );
        }
        if (year > utcYear() && body.confirms_renewal_active_this_year !== true) {
          throw badRequest(
            `Confirm that this is a renewal and the PTIN is also active for ${utcYear()}. A new PTIN for ${year} isn't valid until January 1; record it then`,
          );
        }
        const other = await queryOne<{ id: string }>(
          `SELECT id FROM users WHERE ptin = $1 AND id <> $2`,
          [ptin, id],
        );
        if (other) throw conflict("This PTIN is recorded on another account");
        after = await queryOne<Row>(
          `UPDATE users SET ptin = $1, ptin_year = $2, ptin_note = $3,
             ptin_recorded_at = now(), ptin_recorded_by = $4, updated_at = now()
           WHERE id = $5 RETURNING ${COLUMNS}`,
          [ptin, year, body.note, admin.userId, id],
        );
        break;
      }
      case "clear_ptin":
        after = await queryOne<Row>(
          `UPDATE users SET ptin = NULL, ptin_year = NULL, ptin_note = $1,
             ptin_recorded_at = NULL, ptin_recorded_by = NULL, updated_at = now()
           WHERE id = $2 RETURNING ${COLUMNS}`,
          [body.note, id],
        );
        break;
      case "record_credential":
        after = await queryOne<Row>(
          `UPDATE users SET tax_credential = $1, tax_credential_note = $2,
             tax_credential_recorded_at = now(), tax_credential_recorded_by = $3,
             updated_at = now()
           WHERE id = $4 RETURNING ${COLUMNS}`,
          [body.credential, body.note, admin.userId, id],
        );
        break;
      case "clear_credential":
        after = await queryOne<Row>(
          `UPDATE users SET tax_credential = NULL, tax_credential_note = $1,
             tax_credential_recorded_at = NULL, tax_credential_recorded_by = NULL,
             updated_at = now()
           WHERE id = $2 RETURNING ${COLUMNS}`,
          [body.note, id],
        );
        break;
    }
    if (!after) throw notFound("User not found");

    const isPtin = body.action === "record_ptin" || body.action === "clear_ptin";
    const fields = isPtin ? PTIN_FIELDS : CREDENTIAL_FIELDS;
    const action = {
      record_ptin: "admin.user.ptin_recorded",
      clear_ptin: "admin.user.ptin_cleared",
      record_credential: "admin.user.tax_credential_recorded",
      clear_credential: "admin.user.tax_credential_cleared",
    }[body.action];
    await logAudit(admin.userId, action, "user", id, pick(before, fields), pick(after, fields));
    return ok(view(after));
  });
}
