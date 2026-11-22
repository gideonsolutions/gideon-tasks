import { describe, it, expect } from "vitest";
import {
  isGuardianTutoring,
  moderateContent,
  stripContactInfo,
} from "../moderation";

describe("moderateContent — auto-reject", () => {
  it.each([
    "Need someone to babysit my kids",
    "Looking for childcare services",
    "Nanny needed for two children",
    "My child needs care while I'm at work",
  ])("rejects childcare: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });

  it.each([
    "Looking for an escort for the evening",
    "Need someone for sensual massage",
    "Sugar daddy looking for arrangement",
  ])("rejects sexual content: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });

  it.each([
    "Call me at 555-123-4567",
    "My number is 555 123 4567",
    "Text me at +1-555-123-4567",
    "Reach out: 555.123.4567",
  ])("rejects phone numbers: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });

  it.each([
    "Email me at john@example.com",
    "Send details to test@gmail.com",
  ])("rejects email: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });

  it.each([
    "Check out https://example.com for details",
    "Visit www.example.com",
  ])("rejects URLs: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });

  it.each([
    "Need help to sell some weed",
    "I want to buy some cocaine",
    "Help with weapons manufacturing",
  ])("rejects prohibited uses: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });
});

describe("moderateContent — flagged", () => {
  it.each([
    "Looking for a discreet arrangement",
    "Generous gentleman seeking companionship",
    "Open minded and 420 friendly",
  ])("flags coded language: %s", (text) => {
    expect(moderateContent(text).kind).toBe("flagged");
  });

  it.each(["Help me please", "Need help"])("flags vague: %s", (text) => {
    expect(moderateContent(text).kind).toBe("flagged");
  });
});

describe("moderateContent — clean", () => {
  it.each([
    "I need someone to mow my lawn this Saturday morning in Charlotte",
    "Looking for a handyman to fix a leaky faucet in my kitchen sink",
    "Help me move furniture from my apartment to a storage unit downtown",
    "Need a graphic designer to create a logo for my small business",
    "Professional house cleaning needed for a three bedroom home",
    "Help assembling IKEA furniture - bookshelf and desk",
    "Need someone to paint the exterior of my garden fence",
    "Dog walking needed Monday through Friday while I am at work",
  ])("allows: %s", (text) => {
    expect(moderateContent(text).kind).toBe("clean");
  });
});

describe("stripContactInfo", () => {
  it("strips phone", () => {
    const r = stripContactInfo("Call me at 555-123-4567 for details");
    expect(r).not.toContain("555-123-4567");
    expect(r).toContain("[removed]");
  });
  it("strips email", () => {
    const r = stripContactInfo("Email me at john@example.com please");
    expect(r).not.toContain("john@example.com");
    expect(r).toContain("[removed]");
  });
  it("strips URLs", () => {
    const r = stripContactInfo("See https://example.com for more info");
    expect(r).not.toContain("https://example.com");
    expect(r).toContain("[removed]");
  });
  it("preserves clean text", () => {
    const input = "I need help moving furniture on Saturday";
    expect(stripContactInfo(input)).toBe(input);
  });
});

// ─── Tutoring for a child (tasks.for_minor) ──────────────

const guardianTutoring = { categorySlug: "tutoring", forMinor: true };

describe("isGuardianTutoring", () => {
  it("is true only for a ticked Tutoring task", () => {
    expect(isGuardianTutoring(guardianTutoring)).toBe(true);
    expect(isGuardianTutoring({ categorySlug: "tutoring", forMinor: false })).toBe(false);
    expect(isGuardianTutoring({ categorySlug: "other", forMinor: true })).toBe(false);
    expect(isGuardianTutoring(undefined)).toBe(false);
  });
});

describe("moderateContent — a guardian's tutoring post", () => {
  it.each([
    "My child needs a math tutor for 6th grade fractions, online twice a week",
    "Tutor needed for my kid: reading practice, about an hour per session",
    "Looking for a patient tutor for my children, algebra and geometry",
    "My kids need help with Spanish homework. A tutor who can explain verbs",
  ])("allows tutoring that mentions the child: %s", (text) => {
    expect(moderateContent(text, guardianTutoring).kind).toBe("clean");
  });

  it.each([
    "My kid wants a career in engineering and needs a careful physics tutor",
    "I'll sit in on the sessions; my child is shy and needs a tutor",
  ])("does not mistake ordinary words for childcare: %s", (text) => {
    expect(moderateContent(text, guardianTutoring).kind).toBe("clean");
  });

  it.each([
    "Tutor for my child, and babysit her after the lesson",
    "Tutoring plus babysitting for my kids on Fridays",
    "Need a nanny who can also tutor my children",
    "Tutor my kids then watch my kids until I get home",
    "Math tutor who can take care of the children afterwards",
    "Tutor for my child, then daycare pickup",
    "Tutoring, and a sitter for the kids after",
  ])("still rejects childcare: %s", (text) => {
    const r = moderateContent(text, guardianTutoring);
    expect(r.kind).toBe("rejected");
    expect(r.kind === "rejected" && r.reason).toMatch(/Childcare/);
  });

  it("still rejects contact details", () => {
    expect(
      moderateContent("Tutor for my child, call me at 555-123-4567", guardianTutoring).kind,
    ).toBe("rejected");
  });
});

describe("moderateContent — a child without the guardian's tick", () => {
  it.each([
    "My child needs a math tutor for 6th grade fractions, online twice a week",
    "Tutor needed for my kid: reading practice, about an hour per session",
    "Math tutor wanted.\nIt is for my kids, both in middle school",
  ])("rejects tutoring for a child: %s", (text) => {
    for (const context of [
      undefined,
      { categorySlug: "tutoring", forMinor: false },
      { categorySlug: "other", forMinor: true },
    ]) {
      const r = moderateContent(text, context);
      expect(r.kind).toBe("rejected");
      expect(r.kind === "rejected" && r.reason).toMatch(/tick the box/);
    }
  });

  it.each([
    "Need someone to babysit my kids",
    "Babysitting needed for my kids on Saturday",
    "Looking for a babysitter this weekend",
    "Need someone to watch my kids after school",
  ])("rejects childcare outside Tutoring: %s", (text) => {
    expect(moderateContent(text).kind).toBe("rejected");
  });

  it("still allows a tutoring post that doesn't mention a child", () => {
    expect(
      moderateContent(
        "Looking for a calculus tutor, two online sessions before my exam",
        { categorySlug: "tutoring", forMinor: false },
      ).kind,
    ).toBe("clean");
  });
});
