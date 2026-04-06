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

  const { id } = await params;

  try {
    const check = await db.execute({
      sql: "SELECT id FROM payment_wallets WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "المحفظة غير موجودة" }, { status: 404 });
    }

    const result = await db.execute({
      sql: `SELECT pwt.*, pm.name as method_name
            FROM payment_wallet_transactions pwt
            LEFT JOIN payment_methods pm ON pwt.payment_method_id = pm.id
            WHERE pwt.payment_wallet_id = ?
            ORDER BY pwt.created_at DESC
            LIMIT 100`,
      args: [id],
    });

    const transactions = result.rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount ?? 0),
      type: r.type,
      description: r.description ? String(r.description) : null,
      reference_type: r.reference_type ? String(r.reference_type) : null,
      method_name: r.method_name ? String(r.method_name) : null,
      created_at: r.created_at,
    }));

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Payment wallet transactions error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
