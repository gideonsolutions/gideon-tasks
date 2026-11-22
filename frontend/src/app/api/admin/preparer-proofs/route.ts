import { handle } from "@/server/errors";
import { query } from "@/server/db";
import { requireDocumentAdmin } from "@/server/documents/access";
import { ok } from "@/server/route-helpers";
import { requireDocumentsEnabled } from "@/server/documents/storage";
import { proofColumns, proofView, type ProofRow } from "@/server/documents/proofs";
import { recordablePtinYears, utcYear } from "@/server/tax-preparers";

export const runtime = "nodejs";

/**
 * The review queue: proof documents waiting for an admin, oldest first, with
 * who sent them and what is already recorded for them.
 */
export async function GET(req: Request) {
  return handle(async () => {
    requireDocumentsEnabled();
    await requireDocumentAdmin(req);
    const rows = await query<
      ProofRow & {
        legal_first_name: string;
        legal_last_name: string;
        email: string;
        user_status: string;
        ptin_year: number | null;
        tax_credential: string | null;
      }
    >(
      `SELECT ${proofColumns("p.")},
              u.legal_first_name, u.legal_last_name, u.email, u.status AS user_status,
              u.ptin_year, u.tax_credential
       FROM preparer_proofs p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'pending'
       ORDER BY p.uploaded_at ASC LIMIT 100`,
    );
    return ok({
      current_year: utcYear(),
      recordable_years: recordablePtinYears(),
      proofs: rows.map((r) => ({
        ...proofView(r),
        user: {
          id: r.user_id,
          legal_first_name: r.legal_first_name,
          legal_last_name: r.legal_last_name,
          email: r.email,
          status: r.user_status,
          ptin_year: r.ptin_year,
          tax_credential: r.tax_credential,
        },
      })),
    });
  });
}
