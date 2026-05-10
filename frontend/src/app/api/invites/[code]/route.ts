import { handle, notFound } from "@/server/errors";
import { queryOne } from "@/server/db";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  return handle(async () => {
    const { code } = await params;
    const invite = await queryOne<{
      id: string;
      attestor_id: string;
      code: string;
      target_email: string | null;
      claimed_by: string | null;
      expires_at: string;
      created_at: string;
    }>(`SELECT * FROM invites WHERE code = $1`, [code]);
    if (!invite) throw notFound("Invite not found");

    const valid =
      !invite.claimed_by && new Date(invite.expires_at) > new Date();

    return ok({ ...invite, valid });
  });
}
