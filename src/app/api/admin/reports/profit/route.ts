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

    const result = await db.execute({
      sql: `SELECT inv.id, inv.invoice_number, inv.type, inv.total, inv.created_at,
            ii.item_id, ii.quantity, ii.unit_price, ii.total as item_total, ii.description,
            i.name as item_name, i.purchase_price
            FROM invoices inv
            JOIN invoice_items ii ON ii.invoice_id = inv.id
            LEFT JOIN items i ON ii.item_id = i.id
            WHERE inv.company_id = ? AND inv.type IN ('sale', 'maintenance')
            AND inv.status NOT IN ('cancelled', 'returned')
            AND (inv.is_return = 0 OR inv.is_return IS NULL)
            AND inv.created_at >= ? AND inv.created_at <= ?
            ORDER BY inv.created_at DESC, ii.sort_order`,
      args: [companyId, fromStr, toStr],
    });

    const rows: Array<{
      invoice_number: string;
      type: string;
      item_name: string;
      quantity: number;
      sale_price: number;
      purchase_price: number;
      item_total: number;
      cost_total: number;
      profit: number;
      created_at: string;
    }> = [];
    let totalSales = 0;
    let totalCost = 0;

    for (const r of result.rows) {
      const qty = Number(r.quantity ?? 0);
      const salePrice = Number(r.unit_price ?? 0);
      const purchasePrice = r.item_id ? Number(r.purchase_price ?? 0) : 0;
      const itemTotal = Number(r.item_total ?? 0);
      const costTotal = purchasePrice * qty;
      const profit = itemTotal - costTotal;

      totalSales += itemTotal;
      totalCost += costTotal;

      rows.push({
        invoice_number: String(r.invoice_number ?? ""),
        type: String(r.type ?? ""),
        item_name: r.item_name ? String(r.item_name) : (r.description ? String(r.description) : "صنف"),
        quantity: qty,
        sale_price: salePrice,
        purchase_price: purchasePrice,
        item_total: itemTotal,
        cost_total: costTotal,
        profit,
        created_at: String(r.created_at ?? ""),
      });
    }

    return NextResponse.json({
      rows,
      summary: { totalSales, totalCost, totalProfit: totalSales - totalCost, count: rows.length },
      from: fromDate,
      to: toDate,
    });
  } catch (error) {
    console.error("Profit report error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
