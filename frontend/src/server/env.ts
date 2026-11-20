import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set`);
  return v;
}

const DEFAULT_EMAIL_FROM = "Gideon Tasks <no-reply@gideontasks.com>";

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtAccessExpirySecs: Number(process.env.JWT_ACCESS_EXPIRY_SECS ?? 900),
  jwtRefreshExpirySecs: Number(process.env.JWT_REFRESH_EXPIRY_SECS ?? 604800),
  stripeSecretKey: required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  baseUrl: (
    process.env.BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, ""),
  // Optional at boot so builds and local dev work without it; src/server/email.ts
  // refuses to run without it in production.
  resendApiKey: process.env.RESEND_API_KEY || null,
  emailFrom: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
};

/** Absolute URL on this site, for links that leave the app (emails, redirects). */
export function siteUrl(path: string): string {
  return `${env.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
