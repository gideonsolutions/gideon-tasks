import { describe, it, expect } from "vitest";
import { calculateFees } from "../fees";

describe("calculateFees", () => {
  it("$100 task: 1% fee, $99 payout, total covers stripe fee", () => {
    const b = calculateFees(10_000);
    expect(b.task_price_cents).toBe(10_000);
    expect(b.gideon_fee_cents).toBe(100);
    expect(b.doer_payout_cents).toBe(9_900);
    expect(b.total_charged_cents).toBe(10_433);
    expect(b.stripe_fee_cents).toBe(333);
  });

  it("$5 minimum task", () => {
    const b = calculateFees(500);
    expect(b.gideon_fee_cents).toBe(5);
    expect(b.doer_payout_cents).toBe(495);
    expect(b.total_charged_cents).toBe(551);
    expect(b.stripe_fee_cents).toBe(46);
  });

  it("Gideon fee floors (1% of $7.77 = 7c, not 8c)", () => {
    expect(calculateFees(777).gideon_fee_cents).toBe(7);
    expect(calculateFees(777).doer_payout_cents).toBe(770);
    expect(calculateFees(199).gideon_fee_cents).toBe(1);
    expect(calculateFees(9_999).gideon_fee_cents).toBe(99);
  });

  it("invariants hold across price range", () => {
    for (let price = 500; price <= 500_000; price += 100) {
      const b = calculateFees(price);
      expect(b.doer_payout_cents + b.gideon_fee_cents).toBe(b.task_price_cents);
      expect(b.task_price_cents + b.gideon_fee_cents + b.stripe_fee_cents).toBe(
        b.total_charged_cents,
      );
      expect(b.gideon_fee_cents).toBe(Math.floor(price / 100));
      expect(b.gideon_fee_cents).toBeGreaterThanOrEqual(0);
      expect(b.stripe_fee_cents).toBeGreaterThanOrEqual(0);
      expect(b.doer_payout_cents).toBeGreaterThanOrEqual(0);
      expect(b.total_charged_cents).toBeGreaterThanOrEqual(b.task_price_cents);
    }
  });

  it("$5000 max task (Level 3)", () => {
    const b = calculateFees(500_000);
    expect(b.gideon_fee_cents).toBe(5_000);
    expect(b.doer_payout_cents).toBe(495_000);
  });

  it("Stripe fee for $100 task is reasonable (~$3.33)", () => {
    const b = calculateFees(10_000);
    expect(b.stripe_fee_cents).toBeGreaterThanOrEqual(300);
    expect(b.stripe_fee_cents).toBeLessThanOrEqual(400);
  });
});
