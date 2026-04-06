import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { ensureCompanyWarehouse } from "@/lib/warehouse";
import { getDistributionContext } from "@/lib/distribution";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/**
 * نقل صنف بين مخزنين
 * Body: { item_id, from_warehouse_id, to_warehouse_id, quantity, notes? }
 */
export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { item_id, from_warehouse_id, to_warehouse_id, quantity, notes } = body;

    if (!item_id || !from_warehouse_id || !to_warehouse_id) {
      return NextResponse.json({ error: "الصنف والمخزن المصدر والهدف مطلوبان" }, { status: 400 });
    }

    const qty = Number(quantity) || 0;
    if (qty <= 0) {
      return NextResponse.json({ error: "الكمية يجب أن تكون أكبر من صفر" }, { status: 400 });
    }

    if (from_warehouse_id === to_warehouse_id) {
      return NextResponse.json({ error: "المخزن المصدر والهدف يجب أن يكونا مختلفين" }, { status: 400 });
    }

    const itemResult = await db.execute({
      sql: "SELECT id FROM items WHERE id = ? AND company_id = ?",
      args: [item_id, companyId],
    });
    if (itemResult.rows.length === 0) {
      return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 });
    }

    const whCheck = await db.execute({
      sql: "SELECT id, type FROM warehouses WHERE id IN (?, ?) AND company_id = ?",
      args: [from_warehouse_id, to_warehouse_id, companyId],
    });
    if (whCheck.rows.length < 2) {
      return NextResponse.json({ error: "أحد المخازن غير موجود أو لا ينتمي للشركة" }, { status: 404 });
    }

    const mainId = await ensureCompanyWarehouse(companyId);
    const distCtx = await getDistributionContext(session.user.id, companyId);
    if (distCtx) {
      const okLoad = from_warehouse_id === mainId && to_warehouse_id === distCtx.assignedWarehouseId;
      const okReturn = from_warehouse_id === distCtx.assignedWarehouseId && to_warehouse_id === mainId;
      if (!okLoad && !okReturn) {
        return NextResponse.json(
          { error: "يمكنك النقل فقط بين المخزن الرئيسي ومخزن التوزيع المسند لك (تحميل أو إرجاع بضاعة)" },
          { status: 403 }
        );
      }
    }

    const stockResult = await db.execute({
      sql: "SELECT id, quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
      args: [item_id, from_warehouse_id],
    });

    const available = stockResult.rows.length > 0 ? Number(stockResult.rows[0].quantity ?? 0) : 0;
    if (available < qty) {
      return NextResponse.json({
        error: `الكمية المتاحة في المخزن المصدر: ${available}`,
      }, { status: 400 });
    }

    const transferId = randomUUID();
    const notesStr = typeof notes === "string" ? notes.trim() : "نقل بين المخازن";

    await db.execute({
      sql: "UPDATE item_warehouse_stock SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
      args: [qty, item_id, from_warehouse_id],
    });

    await db.execute({
      sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, performed_by)
            VALUES (?, ?, ?, ?, 'transfer', 'transfer', ?, ?, ?)`,
      args: [randomUUID(), item_id, from_warehouse_id, -qty, transferId, notesStr, session.user.id],
    });

    const destStock = await db.execute({
      sql: "SELECT id, quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
      args: [item_id, to_warehouse_id],
    });

    if (destStock.rows.length > 0) {
      await db.execute({
        sql: "UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
        args: [qty, item_id, to_warehouse_id],
      });
    } else {
      await db.execute({
        sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
        args: [randomUUID(), item_id, to_warehouse_id, qty],
      });
    }

    await db.execute({
      sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, performed_by)
            VALUES (?, ?, ?, ?, 'transfer', 'transfer', ?, ?, ?)`,
      args: [randomUUID(), item_id, to_warehouse_id, qty, transferId, notesStr, session.user.id],
    });

    return NextResponse.json({ success: true, quantity: qty });
  } catch (error) {
    console.error("Stock transfer error:", error);
    return NextResponse.json({ error: "فشل في النقل" }, { status: 500 });
  }
}
