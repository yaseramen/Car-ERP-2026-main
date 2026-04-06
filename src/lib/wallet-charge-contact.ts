/** أرقام شحن المحفظة (مصر) — تُعرض كروابط اتصال واتساب من الواجهة */
export const WALLET_CHARGE_PHONE_ENTRIES = [
  { display: "01009376052", tel: "tel:+201009376052", wa: "https://wa.me/201009376052" },
  { display: "01556660502", tel: "tel:+201556660502", wa: "https://wa.me/201556660502" },
] as const;

/** نص موحّد لرسائل شحن المحفظة — يظهر في حظر الواجهة وفي أخطاء الـ API */
export const WALLET_CHARGE_PHONES_DISPLAY = WALLET_CHARGE_PHONE_ENTRIES.map((e) => e.display).join(" · ");

export const WALLET_CHARGE_MESSAGE = `يجب شحن المحفظة للمتابعة. للتواصل: ${WALLET_CHARGE_PHONE_ENTRIES.map((e) => e.display).join(" أو ")}`;

export function walletInsufficientError(required: number, available: number): string {
  return `رصيد المحفظة غير كافٍ (مطلوب ${required.toFixed(2)} ج.م — متاح ${available.toFixed(2)} ج.م). ${WALLET_CHARGE_MESSAGE}`;
}
