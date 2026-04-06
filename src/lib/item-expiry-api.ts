/** تحويل مدخلات API لصلاحية الصنف — كلها اختيارية */

export function normalizeExpiryInput(body: {
  has_expiry?: unknown;
  expiry_date?: unknown;
}): { has_expiry: number; expiry_date: string | null } {
  const raw = typeof body.expiry_date === "string" ? body.expiry_date.trim() : "";
  const explicitOff =
    body.has_expiry === false ||
    body.has_expiry === 0 ||
    body.has_expiry === "0" ||
    body.has_expiry === "false";
  let has =
    body.has_expiry === true ||
    body.has_expiry === 1 ||
    body.has_expiry === "1" ||
    body.has_expiry === "true";
  if (explicitOff) {
    has = false;
  } else if (!has && raw.length > 0) {
    has = true;
  }
  if (!has) {
    return { has_expiry: 0, expiry_date: null };
  }
  if (!raw) {
    return { has_expiry: 1, expiry_date: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("تاريخ الصلاحية يجب أن يكون بصيغة YYYY-MM-DD");
  }
  return { has_expiry: 1, expiry_date: raw };
}
