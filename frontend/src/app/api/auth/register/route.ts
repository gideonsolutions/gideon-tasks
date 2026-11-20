import { handle, badRequest, conflict } from "@/server/errors";
import { execute, query, queryOne } from "@/server/db";
import { hashPassword, newId } from "@/server/auth";
import { logAudit } from "@/server/audit";
import { ok, parseBody } from "@/server/route-helpers";
import { RegisterSchema } from "@/server/registration";
import { clientIp } from "@/server/abuse-limits";
import { assertEmailDeliverable } from "@/server/email";
import {
  enforceRegistrationLimit,
  issueVerificationEmail,
} from "@/server/email-verification";

export const runtime = "nodejs";

interface InviteRow {
  id: string;
  attestor_id: string;
  target_email: string | null;
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, RegisterSchema);
    const ip = clientIp(req);

    // With an invite: unchanged behaviour (email and phone marked verified,
    // invite claimed, pending attestation). Without one: an open sign-up
    // that must confirm its email address by link.
    let invite: InviteRow | null = null;
    if (body.invite_code) {
      invite = await queryOne<InviteRow>(
        `SELECT id, attestor_id, target_email FROM invites
         WHERE code = $1 AND claimed_by IS NULL AND expires_at > now()`,
        [body.invite_code],
      );
      if (!invite) throw badRequest("Invalid or expired invite code");

      if (invite.target_email && invite.target_email !== body.email) {
        throw badRequest("This invite was issued for a different email address");
      }
    } else {
      // Fail before creating anything if the confirmation email can't go out.
      assertEmailDeliverable();
      await enforceRegistrationLimit(ip);
    }

    const emailExists = await query(
      `SELECT 1 FROM users WHERE lower(email) = lower($1)`,
      [body.email],
    );
    if (emailExists.length > 0) throw conflict("Email already registered");

    const phoneExists = await query(`SELECT 1 FROM users WHERE phone = $1`, [
      body.phone,
    ]);
    if (phoneExists.length > 0) throw conflict("Phone already registered");

    const passwordHash = await hashPassword(body.password);
    const userId = newId();
    const viaInvite = invite !== null;

    await execute(
      `INSERT INTO users (id, email, phone, legal_first_name, legal_last_name, password_hash, email_verified, phone_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [
        userId,
        body.email,
        body.phone,
        body.legal_first_name,
        body.legal_last_name,
        passwordHash,
        viaInvite,
        viaInvite,
      ],
    );

    if (invite) {
      await execute(`UPDATE invites SET claimed_by = $1 WHERE id = $2`, [
        userId,
        invite.id,
      ]);

      await execute(
        `INSERT INTO attestations (id, attestor_id, user_id, status, created_at)
         VALUES ($1, $2, $3, 'pending', now())`,
        [newId(), invite.attestor_id, userId],
      );
    }

    await execute(
      `INSERT INTO reputation_summary (user_id, updated_at) VALUES ($1, now())`,
      [userId],
    );

    await logAudit(
      userId,
      "user.registered",
      "user",
      userId,
      null,
      { email: body.email, via_invite: viaInvite },
      ip,
    );

    if (viaInvite) {
      return ok(
        {
          user_id: userId,
          message: "Account created. You can now log in.",
          email_verification_required: false,
          verification_email_sent: false,
        },
        201,
      );
    }

    // The account exists at this point, so a delivery failure must not turn
    // into an error response: the person can sign in and resend the email.
    let sent = false;
    try {
      await issueVerificationEmail({ id: userId, email: body.email }, ip);
      sent = true;
    } catch (e) {
      console.error("Verification email failed after registration:", e);
    }

    return ok(
      {
        user_id: userId,
        message: sent
          ? "Account created. We emailed you a link to confirm your email address."
          : "Account created, but we could not send the confirmation email. Log in and use “Resend email” on your dashboard.",
        email_verification_required: true,
        verification_email_sent: sent,
      },
      201,
    );
  });
}
