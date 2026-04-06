import { describe, it, expect } from "vitest";
import { expiryUiStatus, parseIsoDate } from "./item-expiry";

describe("item-expiry", () => {
  it("parseIsoDate accepts YYYY-MM-DD", () => {
    const d = parseIsoDate("2026-06-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it("classifies expired vs soon", () => {
    const ref = new Date(2026, 5, 15);
    expect(expiryUiStatus(true, "2025-01-01", ref)).toBe("expired");
    expect(expiryUiStatus(true, "2026-07-01", ref)).toBe("soon");
    expect(expiryUiStatus(true, "2027-01-01", ref)).toBe("ok");
  });
});
