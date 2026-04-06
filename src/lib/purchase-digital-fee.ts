import { isPlatformOwnerCompany } from "@/lib/company";

/** رسوم الخدمة الرقمية الثابتة لفاتورة الشراء (ج.م) — لا تعتمد على حجم الفاتورة */
export const PURCHASE_DIGITAL_SERVICE_FEE_EGP = 0.5;

export function getPurchaseDigitalServiceFee(companyId: string | null | undefined): number {
  if (isPlatformOwnerCompany(companyId)) return 0;
  return PURCHASE_DIGITAL_SERVICE_FEE_EGP;
}
