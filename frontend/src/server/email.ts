import "server-only";
import { Resend } from "resend";
import { env } from "./env";
import { EMAIL_VERIFICATION_TTL_HOURS } from "./verification-token";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const isProduction = () => process.env.NODE_ENV === "production";

let client: Resend | null = null;

function resend(apiKey: string): Resend {
  client ??= new Resend(apiKey);
  return client;
}

/**
 * Throws if email links cannot be delivered in production. Call it before
 * creating anything that depends on an email arriving (such as an account
 * that must confirm its address), so the failure is loud and leaves nothing
 * half-done. Outside production it never throws: emails are logged instead.
 */
export function assertEmailDeliverable(): void {
  if (!isProduction()) return;
  if (!env.resendApiKey) {
    throw new Error("RESEND_API_KEY must be set in production to send email");
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.baseUrl)) {
    throw new Error("BASE_URL must be set in production so email links point at the live site");
  }
}

/**
 * Sends an email through Resend. Without RESEND_API_KEY it throws in
 * production and, elsewhere, prints the message (including any links) to the
 * server console instead of sending it.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!env.resendApiKey) {
    if (isProduction()) {
      throw new Error("RESEND_API_KEY must be set in production to send email");
    }
    console.warn(
      `[email] RESEND_API_KEY is not set, so this email was not sent.\n` +
        `  To: ${message.to}\n  Subject: ${message.subject}\n\n${message.text}\n`,
    );
    return;
  }

  const { error } = await resend(env.resendApiKey).emails.send({
    from: env.emailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  if (error) {
    throw new Error(`Resend could not send "${message.subject}": ${error.name}: ${error.message}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The verification email deliberately contains no user-supplied text (not
 * even the account's name), so sign-ups cannot be used to send arbitrary
 * content to arbitrary addresses from our domain.
 */
export function verificationEmail(to: string, link: string): EmailMessage {
  const lines = {
    intro: "Confirm the email address for your Gideon Tasks account by opening this link:",
    expiry: `The link works once and expires in ${EMAIL_VERIFICATION_TTL_HOURS} hours. If it has expired, sign in and ask for a new one.`,
    ignore: "If you did not create a Gideon Tasks account, you can ignore this email.",
  };
  const href = escapeHtml(link);
  return {
    to,
    subject: "Confirm your email address for Gideon Tasks",
    text: [lines.intro, "", link, "", lines.expiry, "", lines.ignore, ""].join("\n"),
    html: [
      `<p>${lines.intro}</p>`,
      `<p><a href="${href}">${href}</a></p>`,
      `<p>${lines.expiry}</p>`,
      `<p>${lines.ignore}</p>`,
    ].join("\n"),
  };
}

export function sendVerificationEmail(to: string, link: string): Promise<void> {
  return sendEmail(verificationEmail(to, link));
}
