import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { getDistributionContext } from "@/lib/distribution";

const ALLOWED = ["super_admin", "tenant_owner", "employee"] as const;

/**
 * تقرير موزّعين: رصيد خزينة يومية، تسليمات للرئيسية، مبيعات نقدية للفترة.
 * الموظف الموزّع يرى صفه فقط. التسليم والمخزون مرنان — التقرير يوضّح الحركة حسب الفترة المختارة وليس «يومياً» إلزامياً.
 */
export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED.includes(session.user.role as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() || "";
  const to = searchParams.get("to")?.trim() || "";

  const fromSql = from ? `${from} 00:00:00` : null;
  const toSql = to ? `${to} 23:59:59` : null;

  try {
    if (session.user.role === "employee") {
      const ctx = await getDistributionContext(session.user.id, companyId);
      if (!ctx) {
        return NextResponse.json({
          flexible_policy: true,
          policy_note:
            "التسليم النقدي وإرجاع المخزون مرنان — ليس عليك تسليم كل يوم؛ يمكنك العمل لفترات ثم التسوية عند الحاجة.",
          from: from || null,
          to: to || null,
          distributors: [],
          not_a_distributor: true,
        });
      }

      const row = await buildDistributorRow(
        session.user.id,
        companyId,
        ctx.distributionTreasuryId,
        ctx.assignedWarehouseId,
        ctx.warehouseName,
        session.user.name ?? session.user.email ?? "موزّع",
        fromSql,
        toSql
      );
      return NextResponse.json({
        flexible_policy: true,
        policy_note:
          "التسليم النقدي وإرجاع المخزون مرنان — ليس عليك تسليم كل يوم؛ يمكنك العمل لفترات ثم التسوية عند الحاجة.",
        from: from || null,
        to: to || null,
        distributors: [row],
      });
    }

    const users = await db.execute({
      sql: `SELECT u.id, u.name, u.email, w.id as wh_id, w.name as wh_name
            FROM users u
            JOIN warehouses w ON w.id = u.assigned_warehouse_id AND w.company_id = ? AND w.type = 'distribution'
            WHERE u.company_id = ? AND u.role = 'employee'
            ORDER BY u.name`,
      args: [companyId, companyId],
    });

    const distributors = [];
    for (const r of users.rows) {
      const uid = String(r.id ?? "");
      const whId = String(r.wh_id ?? "");
      const whName = String(r.wh_name ?? "");
      const name = String(r.name ?? r.email ?? "");
      const ctx = await getDistributionContext(uid, companyId);
      if (!ctx) continue;
      distributors.push(
        await buildDistributorRow(uid, companyId, ctx.distributionTreasuryId, whId, whName, name, fromSql, toSql)
      );
    }

    return NextResponse.json({
      flexible_policy: true,
      policy_note:
        "التسليم النقدي وإرجاع المخزون مرنان — لا يُفرض تسليم يومي؛ يمكن للموزّع العمل لفترات ثم تسليم النقد أو إرجاع البضاعة للمخزن الرئيسي عند الحاجة.",
      from: from || null,
      to: to || null,
      distributors,
    });
  } catch (e) {
    console.error("report distribution:", e);
    return NextResponse.json({ error: "فشل التقرير" }, { status: 500 });
  }
}

async function buildDistributorRow(
  userId: string,
  companyId: string,
  distributionTreasuryId: string,
  warehouseId: string,
  warehouseName: string,
  userName: string,
  fromSql: string | null,
  toSql: string | null
) {
  let cashInRange = 0;
  let settledInRange = 0;

  if (fromSql && toSql) {
    const cashR = await db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) as s FROM distribution_treasury_transactions
            WHERE distribution_treasury_id = ? AND amount > 0
            AND created_at >= ? AND created_at <= ?`,
      args: [distributionTreasuryId, fromSql, toSql],
    });
    cashInRange = Number(cashR.rows[0]?.s ?? 0);

    const setR = await db.execute({
      sql: `SELECT COALESCE(SUM(-amount), 0) as s FROM distribution_treasury_transactions
            WHERE distribution_treasury_id = ? AND type = 'transfer' AND amount < 0
            AND created_at >= ? AND created_at <= ?`,
      args: [distributionTreasuryId, fromSql, toSql],
    });
    settledInRange = Number(setR.rows[0]?.s ?? 0);
  }

  const balR = await db.execute({
    sql: "SELECT balance FROM distribution_treasuries WHERE id = ?",
    args: [distributionTreasuryId],
  });
  const treasuryNow = Number(balR.rows[0]?.balance ?? 0);

  const stockR = await db.execute({
    sql: `SELECT COALESCE(SUM(iws.quantity), 0) as q FROM item_warehouse_stock iws
          WHERE iws.warehouse_id = ?`,
    args: [warehouseId],
  });
  const stockUnitsTotal = Number(stockR.rows[0]?.q ?? 0);

  return {
    user_id: userId,
    user_name: userName,
    warehouse_id: warehouseId,
    warehouse_name: warehouseName,
    treasury_balance_now: treasuryNow,
    stock_quantity_total: stockUnitsTotal,
    period_cash_in: fromSql && toSql ? cashInRange : null,
    period_settled_to_main: fromSql && toSql ? settledInRange : null,
  };
}
