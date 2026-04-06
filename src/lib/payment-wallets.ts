import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { paymentWalletDisplayName } from "@/lib/payment-wallet-display";

export type PaymentWalletChannel = "vodafone_cash" | "instapay";

/** أرقام فقط، بدون مسافات أو شرطات */
export function normalizeWalletPhoneDigits(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d;
}

export async function getOrCreatePaymentWallet(
  companyId: string,
  channel: PaymentWalletChannel,
  phoneDigits: string
): Promise<{ id: string }> {
  const digits = normalizeWalletPhoneDigits(phoneDigits);
  if (digits.length < 8) {
    throw new Error("رقم المحفظة (المحول إليه) غير صالح");
  }

  const existing = await db.execute({
    sql: `SELECT id FROM payment_wallets
          WHERE company_id = ? AND payment_channel = ? AND phone_digits = ?`,
    args: [companyId, channel, digits],
  });
  if (existing.rows[0]?.id) {
    return { id: String(existing.rows[0].id) };
  }

  const id = randomUUID();
  const name = paymentWalletDisplayName(channel, digits);
  await db.execute({
    sql: `INSERT INTO payment_wallets (id, company_id, payment_channel, phone_digits, name, balance)
          VALUES (?, ?, ?, ?, ?, 0)`,
    args: [id, companyId, channel, digits, name],
  });

  return { id };
}
