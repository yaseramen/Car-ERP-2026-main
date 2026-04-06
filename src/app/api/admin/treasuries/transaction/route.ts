import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { logAudit } from "@/lib/audit";
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
    const { type, treasury_id, amount, description, name: itemName, payment_method_id } = body;

    if (!type || !treasury_id || !amount) {
      return NextResponse.json({ error: "النوع والخزينة والمبلغ مطلوبان" }, { status: 400 });
    }

    if (type !== "expense" && type !== "income") {
      return NextResponse.json({ error: "النوع يجب أن يكون مصروف أو إيراد" }, { status: 400 });
    }

    const amt = Number(amount);
    if (amt <= 0) {
      return NextResponse.json({ error: "المبلغ يجب أن يكون أكبر من صفر" }, { status: 400 });
    }

    const treasury = await db.execute({
      sql: "SELECT id, name, balance FROM treasuries WHERE id = ? AND company_id = ?",
      args: [treasury_id, companyId],
    });

    if (treasury.rows.length === 0) {
      return NextResponse.json({ error: "الخزينة غير موجودة" }, { status: 404 });
    }

    const balance = Number(treasury.rows[0].balance ?? 0);

    if (type === "expense" && balance < amt) {
      return NextResponse.json({
        error: `الرصيد غير كافٍ (متاح: ${balance.toFixed(2)} ج.م)`,
      }, { status: 400 });
    }

    const txId = randomUUID();
    const desc = description?.trim() || (type === "expense" ? "مصروف" : "إيراد");
    const refType = type === "expense" ? "expense" : "income";
    const nameVal = typeof itemName === "string" ? itemName.trim() || null : null;

    if (type === "expense") {
      await db.execute({
        sql: "UPDATE treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
        args: [amt, treasury_id],
      });
      await db.execute({
        sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, item_name, reference_type, reference_id, payment_method_id, performed_by)
              VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?)`,
        args: [txId, treasury_id, -amt, desc, nameVal, refType, txId, payment_method_id || null, session.user.id],
      });
    } else {
      await db.execute({
        sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
        args: [amt, treasury_id],
      });
      await db.execute({
        sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, item_name, reference_type, reference_id, payment_method_id, performed_by)
              VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?)`,
        args: [txId, treasury_id, amt, desc, nameVal, refType, txId, payment_method_id || null, session.user.id],
      });
    }

    const treasuryName = String(treasury.rows[0]?.name ?? "خزينة");
    const label = nameVal || desc;
    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? undefined,
      action: type === "expense" ? "treasury_expense" : "treasury_income",
      entityType: "treasury_transaction",
      entityId: txId,
      details: `${treasuryName}: ${amt.toFixed(2)} ج.م — ${label}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Treasury transaction error:", error);
    return NextResponse.json({ error: "فشل في الإضافة" }, { status: 500 });
  }
}
