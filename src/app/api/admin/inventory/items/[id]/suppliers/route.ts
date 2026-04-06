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
      sql: `SELECT inv.supplier_id, s.name as supplier_name, ii.unit_price, inv.created_at
            FROM invoice_items ii
            JOIN invoices inv ON ii.invoice_id = inv.id
            LEFT JOIN suppliers s ON inv.supplier_id = s.id
            WHERE ii.item_id = ? AND inv.company_id = ? AND inv.type = 'purchase' AND (inv.is_return = 0 OR inv.is_return IS NULL)
            ORDER BY inv.created_at DESC
            LIMIT 20`,
      args: [itemId, companyId],
    });

    const seen = new Set<string>();
    const suppliers: { supplier_id: string; supplier_name: string; last_price: number; last_date: string }[] = [];
    for (const row of result.rows) {
      const sid = String(row.supplier_id ?? "");
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      suppliers.push({
        supplier_id: sid,
        supplier_name: String(row.supplier_name ?? "—"),
        last_price: Number(row.unit_price ?? 0),
        last_date: String(row.created_at ?? ""),
      });
    }

    return NextResponse.json({ suppliers });
  } catch (error) {
    console.error("Item suppliers error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
