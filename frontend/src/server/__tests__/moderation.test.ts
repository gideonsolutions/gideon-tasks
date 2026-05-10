import { describe, it, expect } from "vitest";
import { moderateContent, stripContactInfo } from "../moderation";

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
