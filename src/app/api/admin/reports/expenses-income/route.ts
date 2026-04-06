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
  const nameFilter = searchParams.get("name")?.trim();
  const typeFilter = searchParams.get("type")?.trim();
  const limit = Math.min(200, Math.max(20, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  try {
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);

    const baseWhere = `t.company_id = ? AND tt.reference_type IN ('expense', 'income')
            AND DATE(tt.created_at) >= DATE(?) AND DATE(tt.created_at) <= DATE(?)`;
    const baseArgs: (string | number)[] = [companyId, fromDate, toDate];
    let extraWhere = "";
    if (typeFilter === "expense" || typeFilter === "income") {
      extraWhere += ` AND tt.reference_type = ?`;
      baseArgs.push(typeFilter);
    }
    if (nameFilter) {
      extraWhere += ` AND (tt.item_name LIKE ? OR tt.description LIKE ?)`;
      baseArgs.push(`%${nameFilter}%`, `%${nameFilter}%`);
    }

    const countSql = `SELECT COUNT(*) as cnt FROM treasury_transactions tt
            JOIN treasuries t ON tt.treasury_id = t.id
            WHERE ${baseWhere}${extraWhere}`;
    const countRes = await db.execute({ sql: countSql, args: baseArgs });
    const total = Number(countRes.rows[0]?.cnt ?? 0);

    const sumsSql = `SELECT
            COALESCE(SUM(CASE WHEN tt.reference_type = 'expense' THEN ABS(tt.amount) ELSE 0 END), 0) as exp,
            COALESCE(SUM(CASE WHEN tt.reference_type = 'income' THEN tt.amount ELSE 0 END), 0) as inc
            FROM treasury_transactions tt
            JOIN treasuries t ON tt.treasury_id = t.id
            WHERE ${baseWhere}${extraWhere}`;
    const sumsRes = await db.execute({ sql: sumsSql, args: [...baseArgs] });
    const totalExpenses = Number(sumsRes.rows[0]?.exp ?? 0);
    const totalIncome = Number(sumsRes.rows[0]?.inc ?? 0);

    const rowsSql = `SELECT tt.*, t.name as treasury_name, t.type as treasury_type, pm.name as method_name
            FROM treasury_transactions tt
            JOIN treasuries t ON tt.treasury_id = t.id
            LEFT JOIN payment_methods pm ON tt.payment_method_id = pm.id
            WHERE ${baseWhere}${extraWhere}
            ORDER BY tt.created_at DESC
            LIMIT ? OFFSET ?`;
    const rowsArgs = [...baseArgs, limit, offset];
    const result = await db.execute({ sql: rowsSql, args: rowsArgs });

    const rows = result.rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount ?? 0),
      type: r.reference_type,
      item_name: r.item_name ?? null,
      description: r.description,
      treasury_name: r.treasury_name,
      treasury_type: r.treasury_type,
      method_name: r.method_name,
      created_at: r.created_at,
    }));

    return NextResponse.json({
      rows,
      total,
      totalExpenses,
      totalIncome,
      net: totalIncome - totalExpenses,
      from: fromDate,
      to: toDate,
    });
  } catch (error) {
    console.error("Expenses/income report error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
