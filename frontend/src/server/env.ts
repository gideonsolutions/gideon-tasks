import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtAccessExpirySecs: Number(process.env.JWT_ACCESS_EXPIRY_SECS ?? 900),
  jwtRefreshExpirySecs: Number(process.env.JWT_REFRESH_EXPIRY_SECS ?? 604800),
  stripeSecretKey: required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  baseUrl:
    process.env.BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000",
};
