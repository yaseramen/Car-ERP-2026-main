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
    const fromDate = from || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toDate = to || new Date().toISOString().slice(0, 10);
    const fromStr = `${fromDate}T00:00:00`;
    const toStr = `${toDate}T23:59:59`;

    const result = await db.execute({
      sql: `SELECT inv.supplier_id, s.name as supplier_name,
            COUNT(DISTINCT inv.id) as invoice_count,
            SUM(ii.quantity) as total_quantity,
            SUM(ii.total) as total_amount,
            AVG(ii.unit_price) as avg_price
            FROM invoices inv
            JOIN suppliers s ON inv.supplier_id = s.id
            JOIN invoice_items ii ON ii.invoice_id = inv.id
            WHERE inv.company_id = ? AND inv.type = 'purchase'
            AND (inv.is_return = 0 OR inv.is_return IS NULL)
            AND inv.created_at >= ? AND inv.created_at <= ?
            GROUP BY inv.supplier_id, s.name
            ORDER BY total_amount DESC`,
      args: [companyId, fromStr, toStr],
    });

    const rows = result.rows.map((r) => ({
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      invoice_count: Number(r.invoice_count ?? 0),
      total_quantity: Number(r.total_quantity ?? 0),
      total_amount: Number(r.total_amount ?? 0),
      avg_price: Number(r.avg_price ?? 0),
    }));

    return NextResponse.json({
      rows,
      from: fromDate,
      to: toDate,
    });
  } catch (error) {
    console.error("Suppliers report error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
