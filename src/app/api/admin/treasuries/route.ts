import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { ensureTreasuries } from "@/lib/treasuries";
import { getCompanyId } from "@/lib/company";
import { paymentWalletDisplayName } from "@/lib/payment-wallet-display";

export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  try {
    await ensureTreasuries(companyId);

    const result = await db.execute({
      sql: "SELECT id, name, type, balance FROM treasuries WHERE company_id = ? AND is_active = 1 ORDER BY type",
      args: [companyId],
    });

    const treasuries = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      balance: Number(r.balance ?? 0),
      is_payment_wallet: false as const,
    }));

    let wallets: {
      id: string;
      name: string;
      type: string;
      balance: number;
      is_payment_wallet: true;
      payment_channel: string;
      phone_digits: string;
    }[] = [];
    try {
      const pw = await db.execute({
        sql: "SELECT id, name, payment_channel, phone_digits, balance FROM payment_wallets WHERE company_id = ? AND is_active = 1 ORDER BY payment_channel, phone_digits",
        args: [companyId],
      });
      wallets = pw.rows.map((r) => {
        const ch = String(r.payment_channel ?? "");
        const ph = String(r.phone_digits ?? "");
        return {
          id: String(r.id),
          name: paymentWalletDisplayName(ch, ph, String(r.name ?? "")),
          type: "payment_wallet",
          balance: Number(r.balance ?? 0),
          is_payment_wallet: true as const,
          payment_channel: ch,
          phone_digits: ph,
        };
      });
    } catch {
      wallets = [];
    }

    return NextResponse.json([...treasuries, ...wallets]);
  } catch (error) {
    console.error("Treasuries GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
