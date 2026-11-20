import { afterEach, describe, expect, it, vi } from "vitest";

// `next build` imports every route, and with it env.ts, db.ts and auth.ts; a build without the
// production secrets (a Vercel preview) must still succeed.
const SECRETS = ["DATABASE_URL", "JWT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

describe("server configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("loads without the secrets and names a missing one when it is used", async () => {
    for (const name of SECRETS) vi.stubEnv(name, "");
    const { env } = await import("../env");
    await import("../db");
    await import("../auth");
    expect(() => env.jwtSecret).toThrow("JWT_SECRET must be set");
    expect(() => env.databaseUrl).toThrow("DATABASE_URL must be set");
    expect(() => env.stripeSecretKey).toThrow("STRIPE_SECRET_KEY must be set");
    expect(() => env.stripeWebhookSecret).toThrow("STRIPE_WEBHOOK_SECRET must be set");
  });

  it("reads each secret when it is used", async () => {
    vi.stubEnv("JWT_SECRET", "a-test-secret-of-at-least-thirty-two-chars");
    const { env } = await import("../env");
    expect(env.jwtSecret).toBe("a-test-secret-of-at-least-thirty-two-chars");
  });
});
