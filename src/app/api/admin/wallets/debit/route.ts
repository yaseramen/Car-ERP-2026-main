import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { company_id, amount, description } = body;

    if (!company_id) {
      return NextResponse.json({ error: "الشركة مطلوبة" }, { status: 400 });
    }

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const walletResult = await db.execute({
      sql: "SELECT cw.id, cw.balance FROM company_wallets cw WHERE cw.company_id = ?",
      args: [company_id],
    });

    if (walletResult.rows.length === 0) {
      return NextResponse.json({ error: "المحفظة غير موجودة" }, { status: 404 });
    }

    const wallet = walletResult.rows[0];
    const walletId = wallet.id as string;
    const currentBalance = Number(wallet.balance ?? 0);

    if (amt > currentBalance) {
      return NextResponse.json(
        { error: `الرصيد غير كافٍ. الرصيد الحالي: ${currentBalance.toFixed(2)} ج.م` },
        { status: 400 }
      );
    }

    const newBalance = currentBalance - amt;
    const txId = randomUUID();

    await db.execute({
      sql: "INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, performed_by) VALUES (?, ?, ?, 'debit', ?, ?)",
      args: [txId, walletId, amt, description?.trim() || "خصم من Super Admin (تصحيح خطأ)", session.user.id],
    });

    await db.execute({
      sql: "UPDATE company_wallets SET balance = ?, updated_at = datetime('now') WHERE id = ?",
      args: [newBalance, walletId],
    });

    return NextResponse.json({
      success: true,
      new_balance: newBalance,
      transaction_id: txId,
    });
  } catch (error) {
    console.error("Debit error:", error);
    return NextResponse.json({ error: "فشل في الخصم" }, { status: 500 });
  }
}
