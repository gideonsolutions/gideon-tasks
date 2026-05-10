import { describe, it, expect } from "vitest";
import { calculateFees } from "../fees";

describe("calculateFees — doer_receives mode (default)", () => {
  it("$100 payout at 5%: doer gets full $100, requester pays $108.45, Gideon $5", () => {
    const b = calculateFees(10_000, "doer_receives", 500);
    expect(b.doer_payout_cents).toBe(10_000);
    expect(b.gideon_fee_cents).toBe(500);
    expect(b.total_charged_cents).toBe(10_845);
    expect(b.stripe_fee_cents).toBe(345);
    expect(b.total_charged_cents - b.stripe_fee_cents - b.doer_payout_cents).toBe(
      b.gideon_fee_cents,
    );
  });

  it("$5 minimum payout at 5%", () => {
    const b = calculateFees(500, "doer_receives", 500);
    expect(b.doer_payout_cents).toBe(500);
    expect(b.gideon_fee_cents).toBe(25);
  });

  it("Gideon fee floors", () => {
    expect(calculateFees(777, "doer_receives", 500).gideon_fee_cents).toBe(38);
    expect(calculateFees(199, "doer_receives", 500).gideon_fee_cents).toBe(9);
    expect(calculateFees(9_999, "doer_receives", 500).gideon_fee_cents).toBe(499);
  });

  it("single-fee invariant over price range and tier rates", () => {
    for (const bps of [500, 450, 300, 100]) {
      for (let payout = 500; payout <= 200_000; payout += 250) {
        const b = calculateFees(payout, "doer_receives", bps);
        expect(b.doer_payout_cents).toBe(payout);
        expect(b.gideon_fee_cents).toBe(Math.floor((payout * bps) / 10_000));
        expect(
          b.total_charged_cents -
            b.stripe_fee_cents -
            b.doer_payout_cents -
            b.gideon_fee_cents,
        ).toBe(0);
      }
    }
  });
});

describe("calculateFees — requester_pays mode", () => {
  it("$100 total at 5%: stripe $3.20, gideon $4.60, doer $92.20", () => {
    const b = calculateFees(10_000, "requester_pays", 500);
    expect(b.total_charged_cents).toBe(10_000);
    expect(b.stripe_fee_cents).toBe(320);
    expect(b.doer_payout_cents).toBe(9_220);
    expect(b.gideon_fee_cents).toBe(460);
    expect(b.gideon_fee_cents + b.doer_payout_cents + b.stripe_fee_cents).toBe(
      b.total_charged_cents,
    );
  });

  it("single-fee invariant across tiers", () => {
    for (const bps of [500, 300, 100]) {
      for (let total = 1000; total <= 200_000; total += 500) {
        const b = calculateFees(total, "requester_pays", bps);
        expect(
          b.stripe_fee_cents + b.gideon_fee_cents + b.doer_payout_cents,
        ).toBe(b.total_charged_cents);
        expect(b.doer_payout_cents).toBeGreaterThan(0);
        expect(b.gideon_fee_cents).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("returns zero payout if anchor is too small to cover Stripe fee", () => {
    const b = calculateFees(20, "requester_pays", 500);
    expect(b.doer_payout_cents).toBe(0);
  });
});
