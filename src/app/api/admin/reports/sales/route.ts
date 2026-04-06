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
      sql: `SELECT inv.id, inv.type, inv.status, inv.invoice_number, inv.total, inv.paid_amount, inv.created_at,
            c.name as customer_name, ro.vehicle_plate
            FROM invoices inv
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN repair_orders ro ON inv.repair_order_id = ro.id
            WHERE inv.company_id = ? AND inv.type IN ('sale', 'maintenance')
            AND inv.status NOT IN ('cancelled', 'returned')
            AND inv.created_at >= ? AND inv.created_at <= ?
            ORDER BY inv.created_at DESC
            LIMIT 200`,
      args: [companyId, fromStr, toStr],
    });

    const invoices = result.rows.map((r) => ({
      id: String(r.id ?? ""),
      invoice_number: r.invoice_number,
      type: r.type,
      status: r.status,
      total: Number(r.total ?? 0),
      paid_amount: Number(r.paid_amount ?? 0),
      customer_name: r.customer_name ? String(r.customer_name) : null,
      vehicle_plate: r.vehicle_plate ? String(r.vehicle_plate) : null,
      created_at: r.created_at,
    }));

    const totals = invoices.reduce(
      (acc, inv) => {
        acc.total += inv.total;
        acc.count += 1;
        return acc;
      },
      { total: 0, count: 0 }
    );

    return NextResponse.json({ invoices, totals, from: fromDate, to: toDate });
  } catch (error) {
    console.error("Sales report error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
