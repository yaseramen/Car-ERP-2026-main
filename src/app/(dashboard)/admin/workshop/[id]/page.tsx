import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { RepairOrderEditContent } from "./repair-order-edit-content";

export default async function RepairOrderReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  if (session.user.role === "employee") {
    const allowed = await canAccess(session.user.id, "employee", companyId, "workshop", "read");
    if (!allowed) redirect("/admin");
  }

  const showPurchaseCost =
    session.user.role === "tenant_owner" || session.user.role === "super_admin";

  const { id } = await params;

  const orderResult = await db
    .execute({
      sql: `SELECT ro.*, c.name as customer_name, ro.invoice_id, inv.invoice_number, inv.subtotal, inv.digital_service_fee, inv.total as invoice_total
            FROM repair_orders ro
            LEFT JOIN customers c ON ro.customer_id = c.id
            LEFT JOIN invoices inv ON ro.invoice_id = inv.id
            WHERE ro.id = ? AND ro.company_id = ?`,
      args: [id, companyId],
    })
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));

  if (orderResult.rows.length === 0) notFound();

    const row = orderResult.rows[0];
    const customerId = row.customer_id ? String(row.customer_id) : null;
    const vehiclePlate = String(row.vehicle_plate ?? "");

    const order = {
      id: String(row.id),
      order_number: String(row.order_number ?? ""),
      vehicle_plate: vehiclePlate,
      vehicle_model: row.vehicle_model ? String(row.vehicle_model) : null,
      vehicle_year: row.vehicle_year != null ? Number(row.vehicle_year) : null,
      mileage: row.mileage != null ? Number(row.mileage) : null,
      vin: row.vin ? String(row.vin) : null,
      stage: String(row.stage ?? "received"),
      inspection_notes: row.inspection_notes ? String(row.inspection_notes) : null,
      estimated_completion: row.estimated_completion ? String(row.estimated_completion) : null,
      received_at: row.received_at ? String(row.received_at) : null,
      completed_at: row.completed_at ? String(row.completed_at) : null,
      created_at: String(row.created_at ?? ""),
      customer_name: row.customer_name ? String(row.customer_name) : null,
      invoice_id: row.invoice_id ? String(row.invoice_id) : null,
      invoice_number: row.invoice_number ? String(row.invoice_number) : null,
      invoice_subtotal: row.subtotal != null ? Number(row.subtotal) : null,
      invoice_digital_fee: row.digital_service_fee != null ? Number(row.digital_service_fee) : null,
      invoice_total: row.invoice_total != null ? Number(row.invoice_total) : null,
    };

    const itemsResult = await db.execute({
      sql: `SELECT roi.*, i.name as item_name, i.unit as item_unit
            FROM repair_order_items roi
            JOIN items i ON roi.item_id = i.id
            WHERE roi.repair_order_id = ?
            ORDER BY roi.created_at`,
      args: [id],
    });

    const items = itemsResult.rows.map((r) => {
      const qty = Number(r.quantity ?? 0);
      const up = Number(r.unit_price ?? 0);
      const dt = (r.discount_type as string) || null;
      const dv = Number(r.discount_value ?? 0);
      const tp = r.tax_percent != null ? Number(r.tax_percent) : null;
      const base = qty * up;
      let disc = 0;
      if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
      else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
      const after = Math.max(0, base - disc);
      let tax = 0;
      if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
      const total = Math.round((after + tax) * 100) / 100;
      return {
        id: String(r.id),
        item_name: String(r.item_name ?? ""),
        item_unit: String(r.item_unit ?? "قطعة"),
        quantity: qty,
        unit_price: up,
        discount_type: dt,
        discount_value: dv,
        tax_percent: tp,
        total,
      };
    });

    const servicesResult = await db.execute({
      sql: "SELECT id, description, quantity, unit_price, total, discount_type, discount_value, tax_percent FROM repair_order_services WHERE repair_order_id = ? ORDER BY created_at",
      args: [id],
    });

    const services = servicesResult.rows.map((r) => {
      const qty = Number(r.quantity ?? 1);
      const up = Number(r.unit_price ?? 0);
      const dt = (r.discount_type as string) || null;
      const dv = Number(r.discount_value ?? 0);
      const tp = r.tax_percent != null ? Number(r.tax_percent) : null;
      const base = qty * up;
      let disc = 0;
      if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
      else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
      const after = Math.max(0, base - disc);
      let tax = 0;
      if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
      const total = Math.round((after + tax) * 100) / 100;
      return {
        id: String(r.id),
        description: String(r.description ?? ""),
        quantity: qty,
        unit_price: up,
        discount_type: dt,
        discount_value: dv,
        tax_percent: tp,
        total,
      };
    });

    const itemsTotal = items.reduce((sum, i) => sum + i.total, 0);
    const servicesTotal = services.reduce((sum, s) => sum + s.total, 0);
    const orderType = row.order_type ? String(row.order_type) : "maintenance";

    const previousOrdersResult = customerId
      ? await db.execute({
          sql: `SELECT ro.id, ro.order_number, ro.vehicle_plate, ro.stage, ro.inspection_notes, ro.received_at, ro.completed_at, ro.invoice_id, inv.invoice_number, inv.total as invoice_total
                FROM repair_orders ro
                LEFT JOIN invoices inv ON ro.invoice_id = inv.id
                WHERE ro.company_id = ? AND ro.id != ? AND ro.customer_id = ?
                ORDER BY ro.created_at DESC LIMIT 10`,
          args: [companyId, id, customerId],
        })
      : await db.execute({
          sql: `SELECT ro.id, ro.order_number, ro.vehicle_plate, ro.stage, ro.inspection_notes, ro.received_at, ro.completed_at, ro.invoice_id, inv.invoice_number, inv.total as invoice_total
                FROM repair_orders ro
                LEFT JOIN invoices inv ON ro.invoice_id = inv.id
                WHERE ro.company_id = ? AND ro.id != ? AND ro.vehicle_plate = ?
                ORDER BY ro.created_at DESC LIMIT 10`,
          args: [companyId, id, vehiclePlate],
        });

    const previousOrders = previousOrdersResult.rows.map((r) => ({
      id: String(r.id),
      order_number: String(r.order_number ?? ""),
      vehicle_plate: String(r.vehicle_plate ?? ""),
      stage: String(r.stage ?? ""),
      inspection_notes: r.inspection_notes ? String(r.inspection_notes) : null,
      received_at: r.received_at ? String(r.received_at) : null,
      completed_at: r.completed_at ? String(r.completed_at) : null,
      invoice_id: r.invoice_id ? String(r.invoice_id) : null,
      invoice_number: r.invoice_number ? String(r.invoice_number) : null,
      invoice_total: r.invoice_total != null ? Number(r.invoice_total) : null,
    }));

  return (
    <div className="p-4 md:p-8">
      <RepairOrderEditContent
        order={order}
        items={items}
        services={services}
        itemsTotal={itemsTotal}
        servicesTotal={servicesTotal}
        orderType={orderType}
        previousOrders={previousOrders}
        showPurchaseCost={showPurchaseCost}
      />
    </div>
  );
}
