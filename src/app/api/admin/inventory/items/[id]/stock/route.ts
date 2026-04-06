import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: itemId } = await params;

  try {
    const result = await db.execute({
      sql: `SELECT iws.warehouse_id, w.name as warehouse_name, iws.quantity
            FROM item_warehouse_stock iws
            JOIN warehouses w ON iws.warehouse_id = w.id
            WHERE iws.item_id = ? AND w.company_id = ?`,
      args: [itemId, companyId],
    });

    const stock = result.rows.map((r) => ({
      warehouse_id: r.warehouse_id,
      warehouse_name: String(r.warehouse_name ?? ""),
      quantity: Number(r.quantity ?? 0),
    }));

    return NextResponse.json(stock);
  } catch (error) {
    console.error("Item stock error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
