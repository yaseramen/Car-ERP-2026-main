import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { getTreasuryIdByType } from "@/lib/treasuries";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/** تسليم رصيد خزينة المبيعات أو الورشة إلى الخزينة الرئيسية */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: fromTreasuryId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const rawAmt = body?.amount;
    const amt =
      rawAmt !== undefined && rawAmt !== null && String(rawAmt).trim() !== ""
        ? Number(rawAmt)
        : null;

    const row = await db.execute({
      sql: "SELECT id, type, balance FROM treasuries WHERE id = ? AND company_id = ? AND is_active = 1",
      args: [fromTreasuryId, companyId],
    });
    if (row.rows.length === 0) {
      return NextResponse.json({ error: "الخزينة غير موجودة" }, { status: 404 });
    }

    const tType = String(row.rows[0].type ?? "");
    if (tType !== "sales" && tType !== "workshop") {
      return NextResponse.json(
        { error: "التسليم متاح لخزينة المبيعات أو الورشة فقط" },
        { status: 400 }
      );
    }

    const balance = Number(row.rows[0].balance ?? 0);
    const sweepAmt = amt !== null && !Number.isNaN(amt) && amt > 0 ? amt : balance;

    if (sweepAmt <= 0) {
      return NextResponse.json({ error: "لا يوجد رصيد للتسليم" }, { status: 400 });
    }
    if (sweepAmt > balance) {
      return NextResponse.json(
        { error: `الرصيد غير كافٍ (متاح: ${balance.toFixed(2)} ج.م)` },
        { status: 400 }
      );
    }

    const mainId = await getTreasuryIdByType(companyId, "main");
    if (!mainId) {
      return NextResponse.json({ error: "الخزينة الرئيسية غير مهيأة" }, { status: 500 });
    }
    if (mainId === fromTreasuryId) {
      return NextResponse.json({ error: "لا يمكن التسليم من الخزينة الرئيسية إلى نفسها" }, { status: 400 });
    }

    const refId = randomUUID();
    const label = tType === "sales" ? "خزينة المبيعات" : "خزينة الورشة";
    const desc = `تسليم من ${label} إلى الخزينة الرئيسية`;

    await db.execute({
      sql: "UPDATE treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [sweepAmt, fromTreasuryId, companyId],
    });
    await db.execute({
      sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'out', ?, 'treasury_sweep', ?, ?)`,
      args: [randomUUID(), fromTreasuryId, -sweepAmt, desc, refId, session.user.id],
    });

    await db.execute({
      sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [sweepAmt, mainId, companyId],
    });
    await db.execute({
      sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'in', ?, 'treasury_sweep', ?, ?)`,
      args: [randomUUID(), mainId, sweepAmt, desc, refId, session.user.id],
    });

    return NextResponse.json({ success: true, amount: sweepAmt });
  } catch (e) {
    console.error("treasury sweep-to-main", e);
    return NextResponse.json({ error: "فشل في التسليم" }, { status: 500 });
  }
}
