import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { from_id, to_id, amount, description } = body;

    if (!from_id || !to_id || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "المبلغ والخزينتين مطلوبان" }, { status: 400 });
    }

    if (from_id === to_id) {
      return NextResponse.json({ error: "لا يمكن التحويل لنفس الخزينة" }, { status: 400 });
    }

    const amt = Number(amount);

    const treasuries = await db.execute({
      sql: "SELECT id, balance FROM treasuries WHERE id IN (?, ?) AND company_id = ?",
      args: [from_id, to_id, companyId],
    });

    if (treasuries.rows.length !== 2) {
      return NextResponse.json({ error: "الخزينة غير موجودة" }, { status: 404 });
    }

    const fromT = treasuries.rows.find((r) => r.id === from_id);
    const toT = treasuries.rows.find((r) => r.id === to_id);

    if (!fromT || !toT) {
      return NextResponse.json({ error: "الخزينة غير موجودة" }, { status: 404 });
    }

    const fromBalance = Number(fromT.balance ?? 0);
    if (fromBalance < amt) {
      return NextResponse.json({ error: `الرصيد غير كافٍ (متاح: ${fromBalance.toFixed(2)} ج.م)` }, { status: 400 });
    }

    const txId = randomUUID();
    const desc = description?.trim() || "تحويل بين الخزائن";

    await db.execute({
      sql: "UPDATE treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
      args: [amt, from_id],
    });
    await db.execute({
      sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
      args: [amt, to_id],
    });

    await db.execute({
      sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'out', ?, 'transfer', ?, ?)`,
      args: [randomUUID(), from_id, -amt, desc, txId, session.user.id],
    });
    await db.execute({
      sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'in', ?, 'transfer', ?, ?)`,
      args: [randomUUID(), to_id, amt, desc, txId, session.user.id],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Transfer error:", error);
    return NextResponse.json({ error: "فشل في التحويل" }, { status: 500 });
  }
}
