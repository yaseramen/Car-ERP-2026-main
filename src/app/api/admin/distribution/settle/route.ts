import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { getDistributionContext } from "@/lib/distribution";
import { ensureTreasuries, getTreasuryIdByType } from "@/lib/treasuries";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/** تسليم نقد اليوم من خزينة الموزّع إلى الخزينة الرئيسية */
export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  if (session.user.role !== "employee") {
    return NextResponse.json({ error: "هذه العملية للموزّع فقط" }, { status: 403 });
  }

  const ctx = await getDistributionContext(session.user.id, companyId);
  if (!ctx) {
    return NextResponse.json({ error: "لم يُسند لك مخزن توزيع" }, { status: 400 });
  }

  let body: { amount?: number; notes?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" }, { status: 400 });
  }

  if (amt > ctx.treasuryBalance + 0.0001) {
    return NextResponse.json(
      { error: `المبلغ يتجاوز رصيد خزينتك (${ctx.treasuryBalance.toFixed(2)} ج.م)` },
      { status: 400 }
    );
  }

  try {
    await ensureTreasuries(companyId);
    const mainId = await getTreasuryIdByType(companyId, "main");
    if (!mainId) {
      return NextResponse.json({ error: "الخزينة الرئيسية غير متاحة" }, { status: 400 });
    }

    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    await db.batch(
      [
        {
          sql: "UPDATE distribution_treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
          args: [amt, ctx.distributionTreasuryId],
        },
        {
          sql: `INSERT INTO distribution_treasury_transactions (id, distribution_treasury_id, amount, type, description, performed_by)
                VALUES (?, ?, ?, 'transfer', ?, ?)`,
          args: [
            randomUUID(),
            ctx.distributionTreasuryId,
            -amt,
            notes ? `تسليم للخزينة الرئيسية — ${notes}` : "تسليم نقد اليوم للخزينة الرئيسية",
            session.user.id,
          ],
        },
        {
          sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
          args: [amt, mainId],
        },
        {
          sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, 'in', ?, 'distribution_settle', ?, ?)`,
          args: [
            randomUUID(),
            mainId,
            amt,
            `استلام من موزّع — ${ctx.warehouseName}`,
            ctx.distributionTreasuryId,
            session.user.id,
          ],
        },
      ],
      "write"
    );

    const newBal = await db.execute({
      sql: "SELECT balance FROM distribution_treasuries WHERE id = ?",
      args: [ctx.distributionTreasuryId],
    });
    const balAfter = Number(newBal.rows[0]?.balance ?? 0);

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "treasury_transaction",
      entityType: "distribution_treasury",
      entityId: ctx.distributionTreasuryId,
      details: `تسليم ${amt.toFixed(2)} ج.م من خزينة التوزيع إلى الرئيسية`,
    });

    return NextResponse.json({
      success: true,
      transferred: amt,
      distribution_balance_after: balAfter,
    });
  } catch (e) {
    console.error("distribution settle:", e);
    return NextResponse.json({ error: "فشل التسليم" }, { status: 500 });
  }
}
