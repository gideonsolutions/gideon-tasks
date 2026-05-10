import { handle } from "@/server/errors";
import { ok } from "@/server/route-helpers";

export const runtime = "nodejs";

export async function POST() {
  return handle(async () => ok({ message: "Email verified" }));
}
