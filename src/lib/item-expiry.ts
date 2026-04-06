/** حالة صلاحية الصنف — للعرض فقط (لا تُستخدم لمنع العمليات) */

export type ExpiryUiStatus = "none" | "ok" | "soon" | "expired";

export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(t + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

export function expiryUiStatus(
  hasExpiry: boolean,
  expiryDateStr: string | null | undefined,
  now: Date = new Date()
): ExpiryUiStatus {
  if (!hasExpiry) return "none";
  const d = parseIsoDate(expiryDateStr ?? null);
  if (!d) return "none";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((exp.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "soon";
  return "ok";
}

export function formatExpiryArLabel(status: ExpiryUiStatus, expiryDateStr: string | null | undefined): string | null {
  if (status === "none") return null;
  const d = parseIsoDate(expiryDateStr ?? null);
  const datePart = d ? d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) : "";
  if (status === "expired") return datePart ? `منتهٍ ${datePart}` : "منتهٍ الصلاحية";
  if (status === "soon") return datePart ? `قريب الانتهاء ${datePart}` : "قريب الانتهاء";
  if (status === "ok") return datePart ? `صلاحية ${datePart}` : null;
  return null;
}
