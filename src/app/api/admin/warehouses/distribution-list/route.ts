import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED = ["super_admin", "tenant_owner"] as const;

export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED.includes(session.user.role as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const r = await db.execute({
      sql: `SELECT w.id, w.name, w.location,
            (SELECT u.id FROM users u WHERE u.assigned_warehouse_id = w.id AND u.company_id = ? LIMIT 1) as assigned_user_id
            FROM warehouses w
            WHERE w.company_id = ? AND w.type = 'distribution' AND w.is_active = 1
            ORDER BY w.name`,
      args: [companyId, companyId],
    });
    const warehouses = r.rows.map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      location: row.location ? String(row.location) : null,
      assigned_user_id: row.assigned_user_id ? String(row.assigned_user_id) : null,
    }));
    return NextResponse.json({ warehouses });
  } catch (e) {
    console.error("distribution-list:", e);
    return NextResponse.json({ error: "فشل التحميل" }, { status: 500 });
  }
}
