/**
 * حساب الإجمالي للقطعة/الخدمة مع خصم وضريبة مرنة
 */

export type DiscountType = "percent" | "amount" | null;

export interface LineCalcInput {
  quantity: number;
  unit_price: number;
  discount_type?: DiscountType;
  discount_value?: number;
  tax_percent?: number | null;
}

export function calcLineTotal(input: LineCalcInput): number {
  const { quantity, unit_price, discount_type, discount_value = 0, tax_percent } = input;
  const base = quantity * unit_price;
  let discountAmount = 0;
  if (discount_type === "percent" && discount_value > 0) {
    discountAmount = base * (Math.min(100, discount_value) / 100);
  } else if (discount_type === "amount" && discount_value > 0) {
    discountAmount = Math.min(base, discount_value);
  }
  const afterDiscount = Math.max(0, base - discountAmount);
  let taxAmount = 0;
  if (tax_percent != null && tax_percent > 0) {
    taxAmount = afterDiscount * (Math.min(100, tax_percent) / 100);
  }
  return Math.round((afterDiscount + taxAmount) * 100) / 100;
}
