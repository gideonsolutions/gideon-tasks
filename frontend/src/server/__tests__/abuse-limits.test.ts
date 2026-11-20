import { describe, it, expect } from "vitest";
import {
  PASSWORD_RESET_EMAILS_PER_ACCOUNT_PER_DAY,
  PASSWORD_RESET_EMAIL_MIN_INTERVAL_SECS,
  PASSWORD_RESET_REQUESTS_PER_IP_PER_HOUR,
  REGISTRATIONS_PER_IP_PER_HOUR,
  VERIFICATION_EMAILS_PER_ACCOUNT_PER_DAY,
  VERIFICATION_EMAILS_PER_IP_PER_HOUR,
  VERIFICATION_EMAIL_MIN_INTERVAL_SECS,
  clientIp,
  passwordResetEmailDecision,
  passwordResetRequestDecision,
  registrationDecision,
  verificationEmailDecision,
} from "../abuse-limits";

describe("registrationDecision", () => {
  it("allows sign-ups under the per-IP hourly limit", () => {
    expect(registrationDecision(0).allowed).toBe(true);
    expect(registrationDecision(REGISTRATIONS_PER_IP_PER_HOUR - 1).allowed).toBe(true);
  });

  it("blocks at the limit", () => {
    expect(registrationDecision(REGISTRATIONS_PER_IP_PER_HOUR).allowed).toBe(false);
  });

  it("skips the check when the IP is unknown", () => {
    expect(registrationDecision(null).allowed).toBe(true);
  });
});

describe("verificationEmailDecision", () => {
  const fresh = { secondsSinceLast: null, sentToAccountLastDay: 0, fromIpLastHour: 0 };

  it("allows the first email", () => {
    expect(verificationEmailDecision(fresh).allowed).toBe(true);
  });

  it("enforces a gap between emails to one account", () => {
    const d = verificationEmailDecision({ ...fresh, secondsSinceLast: 10, sentToAccountLastDay: 1 });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/50 seconds/);
    expect(
      verificationEmailDecision({
        ...fresh,
        secondsSinceLast: VERIFICATION_EMAIL_MIN_INTERVAL_SECS,
        sentToAccountLastDay: 1,
      }).allowed,
    ).toBe(true);
  });

  it("caps emails per account per day", () => {
    const d = verificationEmailDecision({
      ...fresh,
      secondsSinceLast: 3600,
      sentToAccountLastDay: VERIFICATION_EMAILS_PER_ACCOUNT_PER_DAY,
    });
    expect(d.allowed).toBe(false);
  });

  it("caps emails per IP per hour, and skips that check without an IP", () => {
    const busy = { ...fresh, fromIpLastHour: VERIFICATION_EMAILS_PER_IP_PER_HOUR };
    expect(verificationEmailDecision(busy).allowed).toBe(false);
    expect(verificationEmailDecision({ ...busy, fromIpLastHour: null }).allowed).toBe(true);
  });
});

describe("password reset limits", () => {
  it("mirror the verification email limits", () => {
    expect(PASSWORD_RESET_EMAIL_MIN_INTERVAL_SECS).toBe(VERIFICATION_EMAIL_MIN_INTERVAL_SECS);
    expect(PASSWORD_RESET_EMAILS_PER_ACCOUNT_PER_DAY).toBe(VERIFICATION_EMAILS_PER_ACCOUNT_PER_DAY);
    expect(PASSWORD_RESET_REQUESTS_PER_IP_PER_HOUR).toBe(VERIFICATION_EMAILS_PER_IP_PER_HOUR);
  });

  it("cap requests per IP per hour, and skip that check without an IP", () => {
    expect(passwordResetRequestDecision(PASSWORD_RESET_REQUESTS_PER_IP_PER_HOUR - 1).allowed).toBe(true);
    const blocked = passwordResetRequestDecision(PASSWORD_RESET_REQUESTS_PER_IP_PER_HOUR);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.reason).not.toMatch(/account/i);
    expect(passwordResetRequestDecision(null).allowed).toBe(true);
  });

  it("space out emails to one account and cap them per day", () => {
    expect(passwordResetEmailDecision({ secondsSinceLast: null, sentToAccountLastDay: 0 }).allowed).toBe(true);
    expect(passwordResetEmailDecision({ secondsSinceLast: 10, sentToAccountLastDay: 1 }).allowed).toBe(false);
    expect(
      passwordResetEmailDecision({
        secondsSinceLast: PASSWORD_RESET_EMAIL_MIN_INTERVAL_SECS,
        sentToAccountLastDay: 1,
      }).allowed,
    ).toBe(true);
    expect(
      passwordResetEmailDecision({
        secondsSinceLast: 3600,
        sentToAccountLastDay: PASSWORD_RESET_EMAILS_PER_ACCOUNT_PER_DAY,
      }).allowed,
    ).toBe(false);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.test/api/auth/register", { headers });

  it("prefers x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to the first x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
  });

  it("accepts IPv6", () => {
    expect(clientIp(req({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("ignores values that are not IP addresses", () => {
    expect(clientIp(req({ "x-real-ip": "'; DROP TABLE users; --" }))).toBeNull();
    expect(clientIp(req({}))).toBeNull();
  });
});
