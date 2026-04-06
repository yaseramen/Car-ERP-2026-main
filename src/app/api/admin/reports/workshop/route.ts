import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    const fromStr = `${fromDate}T00:00:00`;
    const toStr = `${toDate}T23:59:59`;

    const byStageResult = await db.execute({
      sql: `SELECT stage, COUNT(*) as cnt FROM repair_orders WHERE company_id = ? GROUP BY stage`,
      args: [companyId],
    });

    const completedResult = await db.execute({
      sql: `SELECT ro.id, ro.order_number, ro.vehicle_plate, ro.completed_at, inv.total
            FROM repair_orders ro
            LEFT JOIN invoices inv ON ro.invoice_id = inv.id
            WHERE ro.company_id = ? AND ro.stage = 'completed'
            AND ro.completed_at >= ? AND ro.completed_at <= ?
            ORDER BY ro.completed_at DESC
            LIMIT 100`,
      args: [companyId, fromStr, toStr],
    });

    const byStage: Record<string, number> = {};
    for (const row of byStageResult.rows) {
      byStage[String(row.stage ?? "")] = Number(row.cnt ?? 0);
    }

    const completed = completedResult.rows.map((r) => ({
      id: r.id,
      order_number: r.order_number,
      vehicle_plate: r.vehicle_plate,
      completed_at: r.completed_at,
      total: Number(r.total ?? 0),
    }));

    const completedTotal = completed.reduce((sum, o) => sum + o.total, 0);

    return NextResponse.json({
      byStage,
      completed,
      completedCount: completed.length,
      completedTotal,
      from: fromDate,
      to: toDate,
    });
  } catch (error) {
    console.error("Workshop report error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
