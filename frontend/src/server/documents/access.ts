import "server-only";
import { requireAdmin, requireAuth, type AuthUser } from "../auth";
import { requireTwoStep } from "../two-step/service";

// Everyone who uploads, lists, downloads or deletes a task document or a
// preparer proof, and every admin who reviews them, must be signed in with
// two-step sign-in (src/server/two-step/service.ts). Every document and
// proof route starts with one of these.

/** A signed-in user whose session passed two-step sign-in. */
export async function requireDocumentUser(req: Request): Promise<AuthUser> {
  const auth = await requireAuth(req);
  await requireTwoStep(auth);
  return auth;
}

/** An admin whose session passed two-step sign-in. */
export async function requireDocumentAdmin(req: Request): Promise<AuthUser> {
  const admin = await requireAdmin(req);
  await requireTwoStep(admin);
  return admin;
}
