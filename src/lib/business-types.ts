/** أنواع نشاط الشركة في التسجيل والإعدادات */
export const BUSINESS_TYPES = ["sales_only", "service_only", "both", "supplier"] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export function normalizeBusinessType(value: unknown): BusinessType {
  const v = typeof value === "string" ? value.trim() : "";
  return (BUSINESS_TYPES as readonly string[]).includes(v) ? (v as BusinessType) : "both";
}

/** تسمية عربية للعرض في لوحة التحكم */
export function businessTypeLabelAr(bt: string | null | undefined): string {
  switch (bt) {
    case "sales_only":
      return "محل قطع غيار فقط";
    case "service_only":
      return "مركز خدمة فقط";
    case "supplier":
      return "مورّد (محل قطع + سوق لاحقاً، بدون ورشة)";
    case "both":
    default:
      return "بيع + خدمة";
  }
}
