import { describe, it, expect } from "vitest";
import { feeBpsForVolume } from "../fees";

describe("feeBpsForVolume", () => {
  it("returns 500 (5%) at zero volume", () => {
    expect(feeBpsForVolume(0)).toBe(500);
  });

  it("returns 500 just below the $1M boundary", () => {
    expect(feeBpsForVolume(99_999_999)).toBe(500);
  });

  it("returns 450 (4.5%) at exactly $1M", () => {
    expect(feeBpsForVolume(100_000_000)).toBe(450);
  });

  it.each([
    [200_000_000, 400],
    [500_000_000, 350],
    [1_000_000_000, 300],
    [2_000_000_000, 250],
    [5_000_000_000, 200],
    [10_000_000_000, 150],
    [20_000_000_000, 100],
  ])("returns %i bps at threshold %i", (volume, bps) => {
    expect(feeBpsForVolume(volume)).toBe(bps);
  });

  it("floors at 100 bps (1%) for arbitrarily large volumes", () => {
    expect(feeBpsForVolume(1_000_000_000_000)).toBe(100);
  });
});
