import { describe, it, expect } from "vitest";
import { RegisterSchema } from "../registration";

const base = {
  legal_first_name: "Ada",
  legal_last_name: "Lovelace",
  email: "ada@example.com",
  phone: "+1 555 010 0000",
  password: "correct horse",
};

describe("RegisterSchema without an invite", () => {
  it("accepts a sign-up with no invite_code field", () => {
    const r = RegisterSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.invite_code).toBeNull();
  });

  it.each([
    ["empty string", ""],
    ["whitespace", "   "],
    ["null", null],
  ])("treats a %s invite code as no invite", (_label, invite_code) => {
    const r = RegisterSchema.safeParse({ ...base, invite_code });
    expect(r.success).toBe(true);
    expect(r.data?.invite_code).toBeNull();
  });
});

describe("RegisterSchema with an invite", () => {
  it("keeps the code", () => {
    const r = RegisterSchema.safeParse({ ...base, invite_code: "ABCD2345" });
    expect(r.success).toBe(true);
    expect(r.data?.invite_code).toBe("ABCD2345");
  });

  it("trims surrounding whitespace from a pasted code", () => {
    const r = RegisterSchema.safeParse({ ...base, invite_code: "  ABCD2345\n" });
    expect(r.data?.invite_code).toBe("ABCD2345");
  });

  it("rejects a non-string code", () => {
    expect(RegisterSchema.safeParse({ ...base, invite_code: 12345 }).success).toBe(false);
  });
});

describe("RegisterSchema field rules (both paths)", () => {
  it.each([
    ["missing first name", { legal_first_name: "" }],
    ["missing last name", { legal_last_name: "" }],
    ["bad email", { email: "not-an-email" }],
    ["missing phone", { phone: "" }],
    ["short password", { password: "short" }],
    ["very long name", { legal_first_name: "a".repeat(101) }],
    ["very long password", { password: "p".repeat(201) }],
  ])("rejects %s", (_label, patch) => {
    expect(RegisterSchema.safeParse({ ...base, ...patch }).success).toBe(false);
    expect(
      RegisterSchema.safeParse({ ...base, ...patch, invite_code: "ABCD2345" }).success,
    ).toBe(false);
  });
});
