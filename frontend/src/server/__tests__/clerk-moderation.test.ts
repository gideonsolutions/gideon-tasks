import { describe, it, expect } from "vitest";
import {
  CLERK_SECRET_REASON,
  CLERK_SENSITIVE_NUMBER_REASON,
  moderateClerkDescription,
} from "../clerk-moderation";

const CLEAN =
  "I need help filling in the renewal form for my state unemployment benefits. I'm free weekday mornings.";

describe("moderateClerkDescription", () => {
  it("accepts an ordinary request", () => {
    expect(moderateClerkDescription(CLEAN)).toEqual({ kind: "clean" });
    expect(
      moderateClerkDescription(
        "I'm locked out of my online banking and the recovery email isn't arriving. Evenings work best.",
      ),
    ).toEqual({ kind: "clean" });
  });

  it("rejects a Social Security number written with dashes, dots or spaces", () => {
    for (const ssn of ["123-45-6789", "123.45.6789", "123 45 6789"]) {
      expect(moderateClerkDescription(`${CLEAN} My SSN is ${ssn}.`)).toEqual({
        kind: "rejected",
        reason: CLERK_SENSITIVE_NUMBER_REASON,
      });
    }
  });

  it("rejects nine digits in a row (an SSN, or an account or routing number)", () => {
    expect(moderateClerkDescription(`${CLEAN} Number 123456789 on the letter.`)).toMatchObject({
      kind: "rejected",
      reason: CLERK_SENSITIVE_NUMBER_REASON,
    });
  });

  it("leaves shorter numbers alone", () => {
    expect(moderateClerkDescription(`${CLEAN} The form is DS-82 and the letter is dated 11/02/2026.`)).toEqual({
      kind: "clean",
    });
  });

  it("rejects a password or code written into the description", () => {
    for (const secret of ["password: hunter2", "Password=abc123", "PIN: 4321", "one-time code: 552100"]) {
      expect(moderateClerkDescription(`${CLEAN} ${secret}`)).toEqual({
        kind: "rejected",
        reason: CLERK_SECRET_REASON,
      });
    }
  });

  it("still allows talking about passwords", () => {
    expect(
      moderateClerkDescription("I forgot my password for the utility company's website and need to reset it."),
    ).toEqual({ kind: "clean" });
  });

  it("runs the site's usual moderation too", () => {
    expect(moderateClerkDescription(`${CLEAN} Call me at 555-123-4567.`)).toMatchObject({ kind: "rejected" });
    expect(moderateClerkDescription(`${CLEAN} Email me at someone@example.com`)).toMatchObject({
      kind: "rejected",
    });
    expect(moderateClerkDescription(`${CLEAN} The site is https://example.gov/apply`)).toMatchObject({
      kind: "rejected",
    });
    expect(moderateClerkDescription("I need help placing a bet at an online casino account.")).toMatchObject({
      kind: "rejected",
    });
    expect(moderateClerkDescription("Help me with a form")).toMatchObject({ kind: "flagged" });
  });

  it("allows paperwork that mentions children, such as a child care assistance application", () => {
    for (const text of [
      "I need help applying for child care assistance for my two kids through the state website.",
      "Help me fill in my daughter's school enrollment forms; my child starts in January.",
      "I'm applying for a daycare subsidy and the form asks about my children's ages.",
    ]) {
      expect(moderateClerkDescription(text)).toEqual({ kind: "clean" });
    }
  });

  it("keeps the child rules for marketplace content", async () => {
    const { moderateContent } = await import("../moderation");
    expect(
      moderateContent("I need help applying for child care assistance for my two kids through the state website."),
    ).toMatchObject({ kind: "rejected" });
  });

  it("checks for SSNs before phone numbers, so the reason is the specific one", () => {
    expect(moderateClerkDescription(`${CLEAN} 123-45-6789`)).toMatchObject({
      reason: CLERK_SENSITIVE_NUMBER_REASON,
    });
  });
});
