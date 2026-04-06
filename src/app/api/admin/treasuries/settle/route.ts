import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { ensureTreasuries, getTreasuryIdByType } from "@/lib/treasuries";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    await ensureTreasuries(companyId);
    const salesId = await getTreasuryIdByType(companyId, "sales");
    const workshopId = await getTreasuryIdByType(companyId, "workshop");
    const mainId = await getTreasuryIdByType(companyId, "main");

    const body = await request.json();
    const { from_date, to_date, note } = body;

    const salesResult = await db.execute({
      sql: "SELECT balance FROM treasuries WHERE id = ? AND company_id = ?",
      args: [salesId, companyId],
    });
    const workshopResult = await db.execute({
      sql: "SELECT balance FROM treasuries WHERE id = ? AND company_id = ?",
      args: [workshopId, companyId],
    });
    const mainResult = await db.execute({
      sql: "SELECT id FROM treasuries WHERE id = ? AND company_id = ?",
      args: [mainId, companyId],
    });

    if (!salesId || !workshopId || salesResult.rows.length === 0 || workshopResult.rows.length === 0) {
      return NextResponse.json({ error: "الخزائن غير موجودة" }, { status: 400 });
    }

    if (!mainId || mainResult.rows.length === 0) {
      return NextResponse.json({ error: "الخزينة الرئيسية غير موجودة. شغّل الـ migration أولاً." }, { status: 400 });
    }

    const salesBalance = Number(salesResult.rows[0].balance ?? 0);
    const workshopBalance = Number(workshopResult.rows[0].balance ?? 0);
    const total = salesBalance + workshopBalance;

    if (total <= 0) {
      return NextResponse.json({ error: "لا يوجد رصيد للتسليم" }, { status: 400 });
    }

    const desc = note?.trim() || `تسليم نهاية الفترة ${from_date || ""} - ${to_date || ""}`.trim() || "تسليم إلى الخزينة الرئيسية";
    const txId = randomUUID();

    if (salesBalance > 0 && salesId) {
      await db.execute({
        sql: "UPDATE treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
        args: [salesBalance, salesId],
      });
      await db.execute({
        sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'out', ?, 'settlement', ?, ?)`,
        args: [randomUUID(), salesId, -salesBalance, desc, txId, session.user.id],
      });
    }

    if (workshopBalance > 0 && workshopId) {
      await db.execute({
        sql: "UPDATE treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
        args: [workshopBalance, workshopId],
      });
      await db.execute({
        sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'out', ?, 'settlement', ?, ?)`,
        args: [randomUUID(), workshopId, -workshopBalance, desc, txId, session.user.id],
      });
    }

    if (mainId) {
      await db.execute({
        sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
        args: [total, mainId],
      });
      await db.execute({
        sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'in', ?, 'settlement', ?, ?)`,
        args: [randomUUID(), mainId, total, desc, txId, session.user.id],
      });
    }

    return NextResponse.json({
      success: true,
      sales_transferred: salesBalance,
      workshop_transferred: workshopBalance,
      total_transferred: total,
    });
  } catch (error) {
    console.error("Settle error:", error);
    return NextResponse.json({ error: "فشل في التسليم" }, { status: 500 });
  }
}
