import { describe, it, expect } from "vitest";
import { calculateFees } from "../fees";

describe("calculateFees", () => {
  it("$100 task: 5% fee, $95 payout, total covers stripe fee", () => {
    const b = calculateFees(10_000);
    expect(b.task_price_cents).toBe(10_000);
    expect(b.gideon_fee_cents).toBe(500);
    expect(b.doer_payout_cents).toBe(9_500);
    expect(b.total_charged_cents).toBe(10_845);
    expect(b.stripe_fee_cents).toBe(345);
  });

  it("$5 minimum task", () => {
    const b = calculateFees(500);
    expect(b.gideon_fee_cents).toBe(25);
    expect(b.doer_payout_cents).toBe(475);
    expect(b.total_charged_cents).toBe(572);
    expect(b.stripe_fee_cents).toBe(47);
  });

  it("Gideon fee floors (5% of $7.77 = 38c, not 39c)", () => {
    expect(calculateFees(777).gideon_fee_cents).toBe(38);
    expect(calculateFees(777).doer_payout_cents).toBe(739);
    expect(calculateFees(199).gideon_fee_cents).toBe(9);
    expect(calculateFees(9_999).gideon_fee_cents).toBe(499);
  });

  it("invariants hold across price range", () => {
    for (let price = 500; price <= 500_000; price += 100) {
      const b = calculateFees(price);
      expect(b.doer_payout_cents + b.gideon_fee_cents).toBe(b.task_price_cents);
      expect(b.task_price_cents + b.gideon_fee_cents + b.stripe_fee_cents).toBe(
        b.total_charged_cents,
      );
      expect(b.gideon_fee_cents).toBe(Math.floor((price * 500) / 10_000));
      expect(b.gideon_fee_cents).toBeGreaterThanOrEqual(0);
      expect(b.stripe_fee_cents).toBeGreaterThanOrEqual(0);
      expect(b.doer_payout_cents).toBeGreaterThanOrEqual(0);
      expect(b.total_charged_cents).toBeGreaterThanOrEqual(b.task_price_cents);
    }
  });

  it("$5000 max task (Level 3)", () => {
    const b = calculateFees(500_000);
    expect(b.gideon_fee_cents).toBe(25_000);
    expect(b.doer_payout_cents).toBe(475_000);
  });

  it("Stripe fee for $100 task is reasonable (~$3.45)", () => {
    const b = calculateFees(10_000);
    expect(b.stripe_fee_cents).toBeGreaterThanOrEqual(300);
    expect(b.stripe_fee_cents).toBeLessThanOrEqual(400);
  });
});
