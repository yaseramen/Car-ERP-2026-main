import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/** كشف حساب العميل: فواتير، أوامر إصلاح، ملخص */
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

  const custCheck = await db.execute({
    sql: "SELECT id, name FROM customers WHERE id = ? AND company_id = ?",
    args: [id, companyId],
  });
  if (custCheck.rows.length === 0) {
    return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });
  }

  const invoices = await db.execute({
    sql: `SELECT id, invoice_number, type, status, total, paid_amount, created_at
          FROM invoices
          WHERE customer_id = ? AND company_id = ? AND status NOT IN ('cancelled')
          ORDER BY created_at DESC
          LIMIT 200`,
    args: [id, companyId],
  });

  const orders = await db.execute({
    sql: `SELECT id, order_number, vehicle_plate, stage, received_at, completed_at
          FROM repair_orders
          WHERE customer_id = ? AND company_id = ?
          ORDER BY received_at DESC
          LIMIT 100`,
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

  const totalSales = invRows.reduce((s, i) => s + i.total, 0);
  const totalPaid = invRows.reduce((s, i) => s + i.paid_amount, 0);
  const totalBalance = invRows.reduce((s, i) => s + (i.total - i.paid_amount), 0);
  const pendingCount = invRows.filter((i) => i.status === "pending" || i.status === "partial").length;

  return NextResponse.json({
    customer: { id: custCheck.rows[0].id, name: custCheck.rows[0].name },
    invoices: invRows,
    repair_orders: orders.rows.map((r) => ({
      id: r.id,
      order_number: r.order_number,
      vehicle_plate: r.vehicle_plate,
      stage: r.stage,
      received_at: r.received_at,
      completed_at: r.completed_at,
    })),
    summary: {
      totalSales,
      totalPaid,
      totalBalance,
      invoiceCount: invRows.length,
      pendingCount,
      orderCount: orders.rows.length,
    },
  });
}
