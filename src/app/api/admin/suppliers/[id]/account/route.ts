import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/** كشف حساب المورد: فواتير شراء، ملخص */
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

  const supCheck = await db.execute({
    sql: "SELECT id, name FROM suppliers WHERE id = ? AND company_id = ?",
    args: [id, companyId],
  });
  if (supCheck.rows.length === 0) {
    return NextResponse.json({ error: "المورد غير موجود" }, { status: 404 });
  }

  const invoices = await db.execute({
    sql: `SELECT id, invoice_number, type, status, total, paid_amount, created_at
          FROM invoices
          WHERE supplier_id = ? AND company_id = ? AND type = 'purchase' AND status NOT IN ('cancelled')
          ORDER BY created_at DESC
          LIMIT 200`,
    args: [id, companyId],
  });

  const invRows = invoices.rows.map((r) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    type: r.type,
    status: r.status,
    total: Number(r.total ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
    balance: Number(r.total ?? 0) - Number(r.paid_amount ?? 0),
    created_at: r.created_at,
  }));

  const totalPurchases = invRows.reduce((s, i) => s + i.total, 0);
  const totalPaid = invRows.reduce((s, i) => s + i.paid_amount, 0);
  const totalBalance = invRows.reduce((s, i) => s + (i.total - i.paid_amount), 0);
  const pendingCount = invRows.filter((i) => i.status === "pending" || i.status === "partial").length;

  return NextResponse.json({
    supplier: { id: supCheck.rows[0].id, name: supCheck.rows[0].name },
    invoices: invRows,
    summary: {
      totalPurchases,
      totalPaid,
      totalBalance,
      invoiceCount: invRows.length,
      pendingCount,
    },
  });
}
