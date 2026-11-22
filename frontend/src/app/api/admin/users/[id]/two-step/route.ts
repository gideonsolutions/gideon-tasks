import { z } from "zod";
import { handle, badRequest } from "@/server/errors";
import { requireAdmin } from "@/server/auth";
import { ok, parseBody, uuidSchema } from "@/server/route-helpers";
import { adminReset, adminTwoStepView, requireTwoStep } from "@/server/two-step/service";

export const runtime = "nodejs";

// The recovery path for someone who lost both their authenticator app and
// their recovery codes: an admin, signed in with two-step sign-in, confirms
// who they are some other way and resets it, with a note. Audited. There is
// no self-service reset without a code.

async function userId(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) throw badRequest("Not a user ID");
  return id;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    await requireTwoStep(admin);
    return ok(await adminTwoStepView(await userId(params)));
  });
}

const ResetSchema = z.object({
  /** How the admin confirmed who the person is. */
  note: z.string().trim().min(1, "Say how you confirmed who this is").max(500),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin(req);
    await requireTwoStep(admin);
    const id = await userId(params);
    const body = await parseBody(req, ResetSchema);
    await adminReset(admin, id, body.note);
    return ok(await adminTwoStepView(id));
  });
}
