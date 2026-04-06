import { describe, it, expect } from "vitest";
import { resolveVolumeDiscountPercent } from "./price-list-volume-discount";

describe("resolveVolumeDiscountPercent", () => {
  const tiers = [
    { minTotal: 20000, percent: 1 },
    { minTotal: 50000, percent: 2 },
  ];

  it("returns 0 below first tier", () => {
    expect(resolveVolumeDiscountPercent(19999, tiers)).toBe(0);
    expect(resolveVolumeDiscountPercent(0, tiers)).toBe(0);
  });

  it("applies first tier at boundary", () => {
    expect(resolveVolumeDiscountPercent(20000, tiers)).toBe(1);
    expect(resolveVolumeDiscountPercent(35000, tiers)).toBe(1);
  });

  it("applies highest matching tier", () => {
    expect(resolveVolumeDiscountPercent(50000, tiers)).toBe(2);
    expect(resolveVolumeDiscountPercent(100000, tiers)).toBe(2);
  });

  it("handles unsorted tiers", () => {
    const shuffled = [
      { minTotal: 50000, percent: 2 },
      { minTotal: 20000, percent: 1 },
    ];
    expect(resolveVolumeDiscountPercent(60000, shuffled)).toBe(2);
  });
});
