import { timingSafeEqual } from "node:crypto";
import { handle, unauthorized } from "@/server/errors";
import { ok } from "@/server/route-helpers";
import { documentsEnabled } from "@/server/documents/storage";
import { runDocumentRetention } from "@/server/documents/retention";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Deletes documents whose retention period is over (src/server/documents/
 * retention.ts). Vercel Cron calls it daily (vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set, it refuses
 * every call.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    const given = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    if (
      !secret ||
      given.length !== expected.length ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    ) {
      throw unauthorized("Not authorized");
    }
    if (!documentsEnabled()) return ok({ skipped: "Document storage is not set up" });
    return ok(await runDocumentRetention());
  });
}
