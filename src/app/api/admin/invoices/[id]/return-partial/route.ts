import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";
import { allocateReturnInvoiceNumber } from "@/lib/invoice-numbers";
import { logAudit } from "@/lib/audit";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: invoiceId } = await params;

  let body: { items: { item_id: string; quantity: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { items: returnItems } = body;
  if (!Array.isArray(returnItems) || returnItems.length === 0) {
    return NextResponse.json({ error: "حدد أصنافاً للإرجاع" }, { status: 400 });
  }

  const validItems = returnItems.filter(
    (r) => r?.item_id && Number(r?.quantity) > 0
  );
  if (validItems.length === 0) {
    return NextResponse.json({ error: "حدد أصنافاً بكميات صحيحة" }, { status: 400 });
  }

  try {
    const invResult = await db.execute({
      sql: `SELECT id, invoice_number, type, status, warehouse_id, customer_id, supplier_id, repair_order_id
            FROM invoices WHERE id = ? AND company_id = ?`,
      args: [invoiceId, companyId],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const inv = invResult.rows[0];
    const status = String(inv.status ?? "");
    const invType = String(inv.type ?? "");

    if (status === "returned") {
      return NextResponse.json({ error: "الفاتورة مرتجعة بالكامل مسبقاً" }, { status: 400 });
    }

    if (status === "cancelled") {
      return NextResponse.json({ error: "الفاتورة ملغاة" }, { status: 400 });
    }

    const warehouseId = inv.warehouse_id as string;
    if (!warehouseId) {
      return NextResponse.json({ error: "الفاتورة لا تحتوي على مخزن مرتبط" }, { status: 400 });
    }

    const origItemsResult = await db.execute({
      sql: `SELECT ii.item_id, ii.quantity, ii.unit_price, ii.total, i.name as item_name
            FROM invoice_items ii
            LEFT JOIN items i ON ii.item_id = i.id
            WHERE ii.invoice_id = ? AND ii.item_id IS NOT NULL`,
      args: [invoiceId],
    });

    const origItems = new Map<string, { quantity: number; unit_price: number; total: number; name: string }>();
    for (const row of origItemsResult.rows) {
      const itemId = row.item_id as string;
      origItems.set(itemId, {
        quantity: Number(row.quantity ?? 0),
        unit_price: Number(row.unit_price ?? 0),
        total: Number(row.total ?? 0),
        name: String(row.item_name ?? ""),
      });
    }

    const returnItemsResult = await db.execute({
      sql: `SELECT ii.item_id, ii.quantity FROM invoice_items ii
            JOIN invoices inv ON ii.invoice_id = inv.id
            WHERE inv.original_invoice_id = ? AND inv.is_return = 1 AND ii.item_id IS NOT NULL`,
      args: [invoiceId],
    });

    const alreadyReturned = new Map<string, number>();
    for (const row of returnItemsResult.rows) {
      const itemId = row.item_id as string;
      const qty = Number(row.quantity ?? 0);
      alreadyReturned.set(itemId, (alreadyReturned.get(itemId) ?? 0) + qty);
    }

    const invNum = String(inv.invoice_number ?? "");
    const returnInvoiceId = randomUUID();
    const returnInvNum = await allocateReturnInvoiceNumber(companyId, invoiceId, invNum);

    let subtotal = 0;
    const itemsToProcess: { item_id: string; quantity: number; unit_price: number; total: number; name: string }[] = [];

    for (const r of validItems) {
      const itemId = r.item_id;
      const returnQty = Number(r.quantity);

      const orig = origItems.get(itemId);
      if (!orig) {
        return NextResponse.json({ error: `الصنف غير موجود في الفاتورة` }, { status: 400 });
      }

      const maxReturnable = orig.quantity - (alreadyReturned.get(itemId) ?? 0);
      if (returnQty > maxReturnable) {
        return NextResponse.json(
          { error: `الكمية القابلة للإرجاع لـ "${orig.name}" هي ${maxReturnable} فقط` },
          { status: 400 }
        );
      }

      const unitPrice = orig.unit_price;
      const total = returnQty * unitPrice;
      subtotal += total;
      itemsToProcess.push({
        item_id: itemId,
        quantity: returnQty,
        unit_price: unitPrice,
        total,
        name: orig.name,
      });
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json({ error: "لا توجد أصناف صالحة للإرجاع" }, { status: 400 });
    }

    if (invType === "purchase") {
      for (const it of itemsToProcess) {
        const stockResult = await db.execute({
          sql: "SELECT quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
          args: [it.item_id, warehouseId],
        });
        const available = stockResult.rows[0] ? Number(stockResult.rows[0].quantity ?? 0) : 0;
        if (available < it.quantity) {
          return NextResponse.json(
            { error: `الكمية المتاحة لـ "${it.name}" غير كافية (متاح: ${available})` },
            { status: 400 }
          );
        }
      }
    }

    await db.execute({
      sql: `INSERT INTO invoices (id, company_id, invoice_number, type, status, customer_id, supplier_id, repair_order_id, warehouse_id, subtotal, total, paid_amount, is_return, original_invoice_id, created_by)
            VALUES (?, ?, ?, ?, 'returned', ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      args: [
        returnInvoiceId,
        companyId,
        returnInvNum,
        invType,
        inv.customer_id ?? null,
        inv.supplier_id ?? null,
        inv.repair_order_id ?? null,
        warehouseId,
        subtotal,
        subtotal,
        invoiceId,
        session.user.id,
      ],
    });

    for (let i = 0; i < itemsToProcess.length; i++) {
      const it = itemsToProcess[i];
      const iiId = randomUUID();
      const smId = randomUUID();

      await db.execute({
        sql: "INSERT INTO invoice_items (id, invoice_id, item_id, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [iiId, returnInvoiceId, it.item_id, it.quantity, it.unit_price, it.total, i],
      });

      if (invType === "purchase") {
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, ?, 'return', 'invoice_return', ?, ?)`,
          args: [smId, it.item_id, warehouseId, -it.quantity, returnInvoiceId, session.user.id],
        });
        await db.execute({
          sql: "UPDATE item_warehouse_stock SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
          args: [it.quantity, it.item_id, warehouseId],
        });
      } else {
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, ?, 'return', 'invoice_return', ?, ?)`,
          args: [smId, it.item_id, warehouseId, it.quantity, returnInvoiceId, session.user.id],
        });
        const stockExisting = await db.execute({
          sql: "SELECT id FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
          args: [it.item_id, warehouseId],
        });
        if (stockExisting.rows.length > 0) {
          await db.execute({
            sql: "UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
            args: [it.quantity, it.item_id, warehouseId],
          });
        } else {
          await db.execute({
            sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
            args: [randomUUID(), it.item_id, warehouseId, it.quantity],
          });
        }
      }
    }

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "invoice_return",
      entityType: "invoice",
      entityId: returnInvoiceId,
      details: `مرتجع جزئي ${returnInvNum} عن ${invNum}`,
    });

    return NextResponse.json({
      success: true,
      message: "تم إنشاء مرتجع جزئي",
      return_invoice_id: returnInvoiceId,
      return_invoice_number: returnInvNum,
    });
  } catch (error) {
    console.error("Partial return error:", error);
    return NextResponse.json({ error: "فشل في تنفيذ المرتجع" }, { status: 500 });
  }
}
