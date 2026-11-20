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

  it("links a Vercel preview to its own address, and production to BASE_URL", async () => {
    const { baseUrlFrom } = await import("../env");
    expect(baseUrlFrom({ BASE_URL: "https://www.gideontasks.com/", VERCEL_ENV: "production" })).toBe("https://www.gideontasks.com");
    expect(baseUrlFrom({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "gideon-tasks-git-x-team.vercel.app", VERCEL_URL: "gideon-tasks-abc.vercel.app" })).toBe(
      "https://gideon-tasks-git-x-team.vercel.app",
    );
    expect(baseUrlFrom({ VERCEL_ENV: "preview", VERCEL_URL: "gideon-tasks-abc.vercel.app" })).toBe("https://gideon-tasks-abc.vercel.app");
    expect(baseUrlFrom({ VERCEL_ENV: "production", VERCEL_URL: "gideon-tasks-abc.vercel.app" })).toBe("http://localhost:3000");
    expect(baseUrlFrom({})).toBe("http://localhost:3000");
  });

  it("reads each secret when it is used", async () => {
    vi.stubEnv("JWT_SECRET", "a-test-secret-of-at-least-thirty-two-chars");
    const { env } = await import("../env");
    expect(env.jwtSecret).toBe("a-test-secret-of-at-least-thirty-two-chars");
  });
});
