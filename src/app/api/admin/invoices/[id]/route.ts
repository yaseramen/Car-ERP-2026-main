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
    const invResult = await db.execute({
      sql: `SELECT inv.*, c.name as customer_name, c.phone as customer_phone,
            ro.order_number, ro.vehicle_plate, ro.vehicle_model
            FROM invoices inv
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN repair_orders ro ON inv.repair_order_id = ro.id
            WHERE inv.id = ? AND inv.company_id = ?`,
      args: [id, companyId],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const row = invResult.rows[0];
    const invoice = {
      id: row.id,
      invoice_number: row.invoice_number,
      type: row.type,
      status: row.status,
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      tax: Number(row.tax ?? 0),
      digital_service_fee: Number(row.digital_service_fee ?? 0),
      total: Number(row.total ?? 0),
      paid_amount: Number(row.paid_amount ?? 0),
      customer_name: row.customer_name ? String(row.customer_name) : null,
      customer_phone: row.customer_phone ? String(row.customer_phone) : null,
      order_number: row.order_number ? String(row.order_number) : null,
      vehicle_plate: row.vehicle_plate ? String(row.vehicle_plate) : null,
      vehicle_model: row.vehicle_model ? String(row.vehicle_model) : null,
      repair_order_id: row.repair_order_id ? String(row.repair_order_id) : null,
      notes: row.notes ? String(row.notes) : null,
      created_at: row.created_at,
    };

    const itemsResult = await db.execute({
      sql: `SELECT ii.*, i.name as item_name, i.unit as item_unit
            FROM invoice_items ii
            LEFT JOIN items i ON ii.item_id = i.id
            WHERE ii.invoice_id = ?
            ORDER BY ii.sort_order, ii.created_at`,
      args: [id],
    });

    const items = itemsResult.rows.map((r) => ({
      id: r.id,
      item_name: r.item_name ? String(r.item_name) : r.description ?? "صنف",
      item_unit: r.item_unit ? String(r.item_unit) : "قطعة",
      quantity: Number(r.quantity ?? 0),
      unit_price: Number(r.unit_price ?? 0),
      discount: Number(r.discount ?? 0),
      total: Number(r.total ?? 0),
    }));

    return NextResponse.json({ ...invoice, items });
  } catch (error) {
    console.error("Invoice GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
