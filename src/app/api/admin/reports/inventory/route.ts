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
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    const lowStockResult = await db.execute({
      sql: `SELECT i.id, i.name, i.code, i.min_quantity,
            COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = i.id), 0) as quantity
            FROM items i
            WHERE i.company_id = ? AND i.is_active = 1 AND i.min_quantity > 0
            AND COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = i.id), 0) < i.min_quantity
            ORDER BY quantity ASC`,
      args: [companyId],
    });

    let movementsSql = `SELECT sm.id, sm.quantity, sm.movement_type, sm.reference_type, sm.created_at,
            i.name as item_name
            FROM stock_movements sm
            JOIN items i ON sm.item_id = i.id
            WHERE i.company_id = ?`;
    const movementsArgs: (string | number)[] = [companyId];
    if (from && to) {
      movementsSql += ` AND sm.created_at >= ? AND sm.created_at <= ?`;
      movementsArgs.push(`${from}T00:00:00`, `${to}T23:59:59`);
    }
    movementsSql += ` ORDER BY sm.created_at DESC LIMIT ?`;
    movementsArgs.push(limit);

    const movementsResult = await db.execute({
      sql: movementsSql,
      args: movementsArgs,
    });

    const valuationResult = await db.execute({
      sql: `SELECT i.id, i.name, i.code, i.purchase_price,
            COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = i.id), 0) as quantity
            FROM items i
            WHERE i.company_id = ? AND i.is_active = 1
            ORDER BY i.name`,
      args: [companyId],
    });

    let totalValue = 0;
    const valuation = valuationResult.rows.map((r) => {
      const qty = Number(r.quantity ?? 0);
      const cost = Number(r.purchase_price ?? 0);
      const value = qty * cost;
      totalValue += value;
      return {
        id: r.id,
        name: r.name,
        code: r.code,
        quantity: qty,
        purchase_price: cost,
        value,
      };
    });

    const lowStock = lowStockResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      min_quantity: Number(r.min_quantity ?? 0),
      quantity: Number(r.quantity ?? 0),
    }));

    const movements = movementsResult.rows.map((r) => ({
      id: r.id,
      item_name: String(r.item_name ?? ""),
      quantity: Number(r.quantity ?? 0),
      movement_type: String(r.movement_type ?? ""),
      reference_type: r.reference_type ? String(r.reference_type) : null,
      created_at: r.created_at,
    }));

    return NextResponse.json({ lowStock, movements, valuation, totalValue });
  } catch (error) {
    console.error("Inventory report error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
