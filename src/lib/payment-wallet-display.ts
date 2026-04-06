/** تسمية عرض موحّدة لمحافظ الدفع في الخزائن والقوائم */
export function paymentWalletDisplayName(
  channel: string,
  phoneDigits: string,
  storedName?: string
): string {
  const d = (phoneDigits ?? "").trim();
  if (channel === "vodafone_cash") return d ? `محفظة إلكترونية — ${d}` : "محفظة إلكترونية";
  if (channel === "instapay") return d ? `إنستاباي — ${d}` : "إنستاباي";
  const s = (storedName ?? "").trim();
  return s || d || "محفظة";
}
