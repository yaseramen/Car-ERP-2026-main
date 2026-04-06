import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: invoiceId } = await params;

  try {
    const invResult = await db.execute({
      sql: "SELECT id, invoice_number, type, status, warehouse_id, subtotal FROM invoices WHERE id = ? AND company_id = ?",
      args: [invoiceId, companyId],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const inv = invResult.rows[0];
    const status = String(inv.status ?? "");
    const invType = String(inv.type ?? "");

    if (status === "returned") {
      return NextResponse.json({ error: "الفاتورة مرتجعة مسبقاً" }, { status: 400 });
    }

    if (status === "cancelled") {
      return NextResponse.json({ error: "الفاتورة ملغاة" }, { status: 400 });
    }

    const warehouseId = inv.warehouse_id as string;
    if (!warehouseId) {
      return NextResponse.json({ error: "الفاتورة لا تحتوي على مخزن مرتبط" }, { status: 400 });
    }

    const itemsResult = await db.execute({
      sql: "SELECT item_id, quantity FROM invoice_items WHERE invoice_id = ?",
      args: [invoiceId],
    });

    if (itemsResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة لا تحتوي على بنود" }, { status: 400 });
    }

    const invNum = String(inv.invoice_number ?? "");

    for (const row of itemsResult.rows) {
      const itemId = row.item_id as string;
      const qty = Number(row.quantity ?? 0);

      if (invType === "purchase") {
        const stockResult = await db.execute({
          sql: "SELECT quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
          args: [itemId, warehouseId],
        });
        const available = stockResult.rows[0] ? Number(stockResult.rows[0].quantity ?? 0) : 0;
        if (available < qty) {
          return NextResponse.json(
            { error: `الكمية المتاحة للصنف غير كافية للمرتجع (متاح: ${available})` },
            { status: 400 }
          );
        }
      }

      const smId = randomUUID();

      if (invType === "purchase") {
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, ?, 'return', 'invoice_return', ?, ?)`,
          args: [smId, itemId, warehouseId, -qty, invoiceId, session.user.id],
        });
        await db.execute({
          sql: "UPDATE item_warehouse_stock SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
          args: [qty, itemId, warehouseId],
        });
      } else {
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, ?, 'return', 'invoice_return', ?, ?)`,
          args: [smId, itemId, warehouseId, qty, invoiceId, session.user.id],
        });

        const stockExisting = await db.execute({
          sql: "SELECT id FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
          args: [itemId, warehouseId],
        });
        if (stockExisting.rows.length > 0) {
          await db.execute({
            sql: "UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
            args: [qty, itemId, warehouseId],
          });
        } else {
          await db.execute({
            sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
            args: [randomUUID(), itemId, warehouseId, qty],
          });
        }
      }
    }

    /* سياسة المنصة: رسوم الخدمة الرقمية لا تُعاد للمحفظة عند المرتجع (تم خصمها عند الإصدار). */

    await db.execute({
      sql: "UPDATE invoices SET status = 'returned', updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [invoiceId, companyId],
    });

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "invoice_return",
      entityType: "invoice",
      entityId: invoiceId,
      details: `مرتجع كامل للفاتورة ${invNum}`,
    });

    return NextResponse.json({ success: true, message: "تم تحويل الفاتورة إلى مرتجع" });
  } catch (error) {
    console.error("Invoice return error:", error);
    return NextResponse.json({ error: "فشل في تنفيذ المرتجع" }, { status: 500 });
  }
}
