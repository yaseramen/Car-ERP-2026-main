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
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const type = searchParams.get("type")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";
  const search = searchParams.get("search")?.trim() || "";
  const dateFrom = searchParams.get("from")?.trim() || "";
  const dateTo = searchParams.get("to")?.trim() || "";

  try {
    let sql = `SELECT inv.*, c.name as customer_name, ro.order_number, ro.vehicle_plate
            FROM invoices inv
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN repair_orders ro ON inv.repair_order_id = ro.id
            WHERE inv.company_id = ?`;
    const args: (string | number)[] = [companyId];

    if (type && ["sale", "purchase", "maintenance"].includes(type)) {
      sql += ` AND inv.type = ?`;
      args.push(type);
    }
    if (status && ["draft", "pending", "paid", "partial", "returned", "cancelled"].includes(status)) {
      sql += ` AND inv.status = ?`;
      args.push(status);
    }
    if (dateFrom) {
      sql += ` AND inv.created_at >= ?`;
      args.push(dateFrom + " 00:00:00");
    }
    if (dateTo) {
      sql += ` AND inv.created_at <= ?`;
      args.push(dateTo + " 23:59:59");
    }
    if (search) {
      sql += ` AND (inv.invoice_number LIKE ? OR c.name LIKE ? OR ro.vehicle_plate LIKE ?)`;
      const q = `%${search}%`;
      args.push(q, q, q);
    }

    const countSql = `SELECT COUNT(*) as cnt FROM invoices inv
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN repair_orders ro ON inv.repair_order_id = ro.id
            WHERE inv.company_id = ?${type && ["sale", "purchase", "maintenance"].includes(type) ? " AND inv.type = ?" : ""}${status && ["draft", "pending", "paid", "partial", "returned", "cancelled"].includes(status) ? " AND inv.status = ?" : ""}${dateFrom ? " AND inv.created_at >= ?" : ""}${dateTo ? " AND inv.created_at <= ?" : ""}${search ? " AND (inv.invoice_number LIKE ? OR c.name LIKE ? OR ro.vehicle_plate LIKE ?)" : ""}`;
    const countResult = await db.execute({ sql: countSql, args });
    const total = Number(countResult.rows[0]?.cnt ?? 0);

    sql += ` ORDER BY inv.created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    const result = await db.execute({ sql, args });

    const invoices = result.rows.map((row) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      type: row.type,
      status: row.status,
      subtotal: Number(row.subtotal ?? 0),
      digital_service_fee: Number(row.digital_service_fee ?? 0),
      total: Number(row.total ?? 0),
      paid_amount: Number(row.paid_amount ?? 0),
      customer_name: row.customer_name ? String(row.customer_name) : null,
      order_number: row.order_number ? String(row.order_number) : null,
      vehicle_plate: row.vehicle_plate ? String(row.vehicle_plate) : null,
      repair_order_id: row.repair_order_id ? String(row.repair_order_id) : null,
      created_at: row.created_at,
    }));

    return NextResponse.json({ invoices, total });
  } catch (error) {
    console.error("Invoices GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
