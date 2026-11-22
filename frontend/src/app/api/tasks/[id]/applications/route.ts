import { z } from "zod";
import {
  handle,
  notFound,
  forbidden,
  badRequest,
  conflict,
  contentRejected,
  trustLevelInsufficient,
} from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { requireAuth, newId } from "@/server/auth";
import {
  canApplyForTasks,
  maxConcurrentDoer,
  maxTaskValueCents,
} from "@/server/trust-levels";
import { moderateContent } from "@/server/moderation";
import { calculateFees, feeBpsForVolume } from "@/server/fees";
import { platformVolumeCents } from "@/server/platform-volume";
import { requireVerifiedEmail } from "@/server/email-verification";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";
import { requireBackgroundCheck } from "@/server/minor-safeguards";
import { requireTaxQualification } from "@/server/tax-prep-gate";
import { publicPreparerBadges } from "@/server/tax-preparers";

export const runtime = "nodejs";

const CreateSchema = z.object({ message: z.string().optional().nullable() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const body = await parseBody(req, CreateSchema);

    const task = await queryOne<{
      requester_id: string;
      status: string;
      price_cents: number;
      pricing_mode: "doer_receives" | "requester_pays";
      for_minor: boolean;
      category_slug: string | null;
    }>(
      `SELECT t.requester_id, t.status, t.price_cents, t.pricing_mode, t.for_minor,
              c.slug AS category_slug
       FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.status !== "published")
      throw badRequest("Can only apply to published tasks");
    if (task.requester_id === auth.userId)
      throw badRequest("Cannot apply to your own task");
    const emailVerified = await requireVerifiedEmail(auth.userId, "apply");
    if (!canApplyForTasks(auth.trustLevel, emailVerified))
      throw trustLevelInsufficient("Cannot apply for tasks at this trust level");
    if (task.for_minor) await requireBackgroundCheck(auth.userId);
    await requireTaxQualification(auth.userId, task.category_slug);

    const maxConc = maxConcurrentDoer(auth.trustLevel);
    const active = await queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tasks
       WHERE assigned_doer_id = $1 AND status IN ('assigned','in_progress','submitted')`,
      [auth.userId],
    );
    if ((active?.count ?? 0) >= maxConc) {
      throw badRequest(`Maximum concurrent doer tasks reached (${maxConc})`);
    }

    const feeBps = feeBpsForVolume(await platformVolumeCents());
    const fees = calculateFees(task.price_cents, task.pricing_mode, feeBps);
    const maxVal = maxTaskValueCents(auth.trustLevel);
    if (fees.doer_payout_cents > maxVal) {
      throw trustLevelInsufficient(
        `Task payout ($${(fees.doer_payout_cents / 100).toFixed(2)}) exceeds your trust level maximum ($${(maxVal / 100).toFixed(2)})`,
      );
    }

    const dup = await query(
      `SELECT 1 FROM task_applications WHERE task_id = $1 AND doer_id = $2`,
      [id, auth.userId],
    );
    if (dup.length > 0) throw conflict("Already applied to this task");

    if (body.message) {
      const m = moderateContent(body.message, {
        categorySlug: task.category_slug,
        forMinor: task.for_minor,
      });
      if (m.kind === "rejected") throw contentRejected(m.reason);
    }

    const appId = newId();
    await execute(
      `INSERT INTO task_applications (id, task_id, doer_id, message, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', now())`,
      [appId, id, auth.userId, body.message ?? null],
    );
    await logAudit(
      auth.userId,
      "application.created",
      "task_application",
      appId,
      null,
      { task_id: id },
    );
    return ok({ id: appId, message: "Application submitted" }, 201);
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const auth = await requireAuth(req);
    const { id } = await params;
    const task = await queryOne<{ requester_id: string }>(
      `SELECT requester_id FROM tasks WHERE id = $1`,
      [id],
    );
    if (!task) throw notFound("Task not found");
    if (task.requester_id !== auth.userId) throw forbidden("Not your task");

    const rows = await query<
      Record<string, unknown> & {
        doer_status: string;
        doer_has_ptin: boolean;
        doer_ptin_year: number | null;
        doer_tax_credential: string | null;
      }
    >(
      `SELECT a.*, u.status AS doer_status, (u.ptin IS NOT NULL) AS doer_has_ptin,
              u.ptin_year AS doer_ptin_year, u.tax_credential AS doer_tax_credential
       FROM task_applications a JOIN users u ON u.id = a.doer_id
       WHERE a.task_id = $1 ORDER BY a.created_at ASC`,
      [id],
    );
    // Each applicant's credential and current-year PTIN badge; never the PTIN.
    return ok(
      rows.map(
        ({ doer_status, doer_has_ptin, doer_ptin_year, doer_tax_credential, ...app }) => ({
          ...app,
          doer_badges: publicPreparerBadges({
            status: doer_status,
            has_ptin: doer_has_ptin,
            ptin_year: doer_ptin_year,
            tax_credential: doer_tax_credential,
          }),
        }),
      ),
    );
  });
}
