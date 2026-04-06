import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await db.execute({
      sql: `SELECT DISTINCT tt.item_name
            FROM treasury_transactions tt
            JOIN treasuries t ON tt.treasury_id = t.id
            WHERE t.company_id = ? AND tt.reference_type IN ('expense', 'income')
            AND tt.item_name IS NOT NULL AND tt.item_name != ''
            ORDER BY tt.item_name`,
      args: [companyId],
    });

    const names = result.rows.map((r) => String(r.item_name ?? "")).filter(Boolean);
    return NextResponse.json({ names });
  } catch (error) {
    const msg = String((error as Error)?.cause ?? error);
    if (msg.includes("no such column") || msg.includes("item_name")) {
      return NextResponse.json({ names: [] });
    }
    console.error("Expenses/income names error:", error);
    return NextResponse.json({ error: "فشل في جلب الأسماء" }, { status: 500 });
  }
}
