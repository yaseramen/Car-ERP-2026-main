import { describe, it, expect } from "vitest";
import { getCompanyId, requireCompanyId, SYSTEM_COMPANY_ID } from "../company";
import type { Session } from "next-auth";

describe("getCompanyId", () => {
  it("returns null for null session", () => {
    expect(getCompanyId(null)).toBeNull();
  });

  it("returns SYSTEM_COMPANY_ID for super_admin", () => {
    const session = { user: { id: "1", role: "super_admin" } } as Session;
    expect(getCompanyId(session)).toBe(SYSTEM_COMPANY_ID);
  });

  it("returns companyId for tenant_owner", () => {
    const session = { user: { id: "1", role: "tenant_owner", companyId: "comp-123" } } as Session;
    expect(getCompanyId(session)).toBe("comp-123");
  });

  it("returns null when companyId is missing for employee", () => {
    const session = { user: { id: "1", role: "employee" } } as Session;
    expect(getCompanyId(session)).toBeNull();
  });
});

describe("requireCompanyId", () => {
  it("throws when session has no company", () => {
    expect(() => requireCompanyId(null)).toThrow("غير مصرح");
  });

  it("returns company id when present", () => {
    const session = { user: { id: "1", role: "tenant_owner", companyId: "comp-456" } } as Session;
    expect(requireCompanyId(session)).toBe("comp-456");
  });
});
