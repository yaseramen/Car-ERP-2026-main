import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../error-messages";

describe("getErrorMessage", () => {
  it("returns network error message for fetch failures", () => {
    const err = new Error("Failed to fetch");
    expect(getErrorMessage(err)).toContain("الاتصال");
  });

  it("returns 401 message for unauthorized", () => {
    const err = new Error("401 Unauthorized");
    expect(getErrorMessage(err)).toContain("جلستك");
  });

  it("returns fallback for unknown errors", () => {
    const err = new Error("Some unknown error");
    expect(getErrorMessage(err)).toBe("Some unknown error");
  });

  it("returns custom fallback when provided", () => {
    expect(getErrorMessage(null, "رسالة مخصصة")).toBe("رسالة مخصصة");
  });
});
