import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";

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
    const result = await db.execute({
      sql: `SELECT roi.*, i.name as item_name, i.unit as item_unit
            FROM repair_order_items roi
            JOIN items i ON roi.item_id = i.id
            WHERE roi.repair_order_id = ?`,
      args: [id],
    });

    const items = result.rows.map((row) => {
      const qty = Number(row.quantity ?? 0);
      const up = Number(row.unit_price ?? 0);
      const dt = (row.discount_type as string) || null;
      const dv = Number(row.discount_value ?? 0);
      const tp = row.tax_percent != null ? Number(row.tax_percent) : null;
      const base = qty * up;
      let disc = 0;
      if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
      else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
      const after = Math.max(0, base - disc);
      let tax = 0;
      if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
      const total = Math.round((after + tax) * 100) / 100;
      return {
        id: row.id,
        item_id: row.item_id,
        item_name: row.item_name,
        item_unit: row.item_unit,
        quantity: qty,
        unit_price: up,
        discount_type: dt,
        discount_value: dv,
        tax_percent: tp,
        total,
      };
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Order items GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: orderId } = await params;

  try {
    const body = await request.json();
    const { item_id, quantity, discount_type, discount_value, tax_percent } = body;

    if (!item_id || !quantity || Number(quantity) <= 0) {
      return NextResponse.json({ error: "الصنف والكمية مطلوبان" }, { status: 400 });
    }

    const qty = Number(quantity);

    const orderResult = await db.execute({
      sql: "SELECT id, warehouse_id, stage, invoice_id FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: "أمر الإصلاح غير موجود" }, { status: 404 });
    }

    const order = orderResult.rows[0];
    if (order.invoice_id) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد إصدار الفاتورة" }, { status: 400 });
    }

    const stage = order.stage as string;
    if (stage !== "maintenance" && stage !== "ready") {
      return NextResponse.json(
        { error: "يمكن إضافة القطع فقط في مرحلة الصيانة أو الجاهزة" },
        { status: 400 }
      );
    }

    const warehouseId = order.warehouse_id as string;

    const stockResult = await db.execute({
      sql: "SELECT quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
      args: [item_id, warehouseId],
    });

    const available = stockResult.rows[0]
      ? Number(stockResult.rows[0].quantity ?? 0)
      : 0;

    if (available < qty) {
      return NextResponse.json(
        { error: `الكمية المتاحة: ${available}` },
        { status: 400 }
      );
    }

    const itemResult = await db.execute({
      sql: "SELECT sale_price FROM items WHERE id = ? AND company_id = ?",
      args: [item_id, companyId],
    });

    if (itemResult.rows.length === 0) {
      return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 });
    }

    const unitPrice = Number(itemResult.rows[0].sale_price ?? 0);
    const dt = discount_type === "percent" || discount_type === "amount" ? discount_type : null;
    const dv = Math.max(0, Number(discount_value ?? 0));
    const tp = tax_percent != null && !Number.isNaN(Number(tax_percent)) ? Number(tax_percent) : null;
    const base = qty * unitPrice;
    let disc = 0;
    if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
    else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
    const after = Math.max(0, base - disc);
    let tax = 0;
    if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
    const total = Math.round((after + tax) * 100) / 100;

    const roiId = randomUUID();
    const smId = randomUUID();

    await db.execute({
      sql: "INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by) VALUES (?, ?, ?, ?, 'workshop_install', 'repair_order', ?, ?)",
      args: [smId, item_id, warehouseId, qty, orderId, session.user.id],
    });

    await db.execute({
      sql: "UPDATE item_warehouse_stock SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
      args: [qty, item_id, warehouseId],
    });

    await db.execute({
      sql: "INSERT INTO repair_order_items (id, repair_order_id, item_id, warehouse_id, quantity, unit_price, total, stock_movement_id, discount_type, discount_value, tax_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [roiId, orderId, item_id, warehouseId, qty, unitPrice, total, smId, dt, dv, tp],
    });

    const newItem = await db.execute({
      sql: `SELECT roi.*, i.name as item_name FROM repair_order_items roi JOIN items i ON roi.item_id = i.id WHERE roi.id = ?`,
      args: [roiId],
    });

    const row = newItem.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      id: row.id,
      item_id: row.item_id,
      item_name: row.item_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      discount_type: dt,
      discount_value: dv,
      tax_percent: tp,
      total: row.total,
    });
  } catch (error) {
    console.error("Add item error:", error);
    return NextResponse.json({ error: "فشل في إضافة القطعة" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: orderId } = await params;

  try {
    const body = await request.json();
    const { item_id: roiId, discount_type, discount_value, tax_percent } = body;
    if (!roiId) return NextResponse.json({ error: "معرف القطعة مطلوب" }, { status: 400 });

    const orderCheck = await db.execute({
      sql: "SELECT invoice_id FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });
    if (orderCheck.rows.length === 0) return NextResponse.json({ error: "أمر غير موجود" }, { status: 404 });
    if (orderCheck.rows[0]?.invoice_id) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد إصدار الفاتورة" }, { status: 400 });
    }

    const roi = await db.execute({
      sql: "SELECT quantity, unit_price FROM repair_order_items roi JOIN repair_orders ro ON roi.repair_order_id = ro.id WHERE roi.id = ? AND roi.repair_order_id = ? AND ro.company_id = ?",
      args: [roiId, orderId, companyId],
    });
    if (roi.rows.length === 0) return NextResponse.json({ error: "القطعة غير موجودة" }, { status: 404 });

    const qty = Number(roi.rows[0].quantity ?? 0);
    const up = Number(roi.rows[0].unit_price ?? 0);
    const dt = discount_type === "percent" || discount_type === "amount" ? discount_type : null;
    const dv = Math.max(0, Number(discount_value ?? 0));
    const tp = tax_percent != null && !Number.isNaN(Number(tax_percent)) ? Number(tax_percent) : null;

    const base = qty * up;
    let disc = 0;
    if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
    else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
    const after = Math.max(0, base - disc);
    let tax = 0;
    if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
    const total = Math.round((after + tax) * 100) / 100;

    await db.execute({
      sql: "UPDATE repair_order_items SET discount_type = ?, discount_value = ?, tax_percent = ?, total = ? WHERE id = ?",
      args: [dt, dv, tp, total, roiId],
    });

    const res = await db.execute({
      sql: `SELECT roi.*, i.name as item_name, i.unit as item_unit FROM repair_order_items roi JOIN items i ON roi.item_id = i.id WHERE roi.id = ?`,
      args: [roiId],
    });
    const r = res.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      id: r.id,
      item_id: r.item_id,
      item_name: r.item_name,
      item_unit: r.item_unit,
      quantity: r.quantity,
      unit_price: r.unit_price,
      discount_type: dt,
      discount_value: dv,
      tax_percent: tp,
      total: r.total,
    });
  } catch (error) {
    console.error("Update item error:", error);
    return NextResponse.json({ error: "فشل في التحديث" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");
  if (!itemId) {
    return NextResponse.json({ error: "معرف القطعة مطلوب" }, { status: 400 });
  }

  const { id: orderId } = await params;

  try {
    const orderCheck = await db.execute({
      sql: "SELECT invoice_id, stage FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });
    if (orderCheck.rows.length === 0) return NextResponse.json({ error: "أمر الإصلاح غير موجود" }, { status: 404 });
    if (orderCheck.rows[0]?.invoice_id) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد إصدار الفاتورة" }, { status: 400 });
    }

    const roiResult = await db.execute({
      sql: "SELECT roi.id, roi.item_id, roi.quantity, roi.warehouse_id, roi.stock_movement_id FROM repair_order_items roi JOIN repair_orders ro ON roi.repair_order_id = ro.id WHERE roi.id = ? AND roi.repair_order_id = ? AND ro.company_id = ?",
      args: [itemId, orderId, companyId],
    });
    if (roiResult.rows.length === 0) {
      return NextResponse.json({ error: "القطعة غير موجودة" }, { status: 404 });
    }

    const row = roiResult.rows[0];
    const qty = Number(row.quantity ?? 0);
    const warehouseId = row.warehouse_id as string;
    const dbItemId = row.item_id as string;

    if (qty > 0 && warehouseId) {
      const smId = randomUUID();
      await db.execute({
        sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, ?, 'return', 'repair_order_item_remove', ?, ?)`,
        args: [smId, dbItemId, warehouseId, qty, itemId, session.user.id],
      });
      const stockExisting = await db.execute({
        sql: "SELECT id FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
        args: [dbItemId, warehouseId],
      });
      if (stockExisting.rows.length > 0) {
        await db.execute({
          sql: "UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
          args: [qty, dbItemId, warehouseId],
        });
      } else {
        await db.execute({
          sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
          args: [randomUUID(), dbItemId, warehouseId, qty],
        });
      }
    }

    await db.execute({
      sql: "DELETE FROM repair_order_items WHERE id = ?",
      args: [itemId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove item error:", error);
    return NextResponse.json({ error: "فشل في إزالة القطعة" }, { status: 500 });
  }
}
