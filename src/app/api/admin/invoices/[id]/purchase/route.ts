import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { getPurchaseDigitalServiceFee } from "@/lib/purchase-digital-fee";
import { randomUUID } from "crypto";
import { logAudit } from "@/lib/audit";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

type LineIn = {
  id?: string | null;
  item_id: string;
  quantity: number;
  unit_price: number;
  /** إن وُجد يُحدَّث سعر البيع على بطاقة الصنف */
  sale_price?: number | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const userId = session.user.id;

  const { id: invoiceId } = await params;

  let body: {
    supplier_id?: string | null;
    notes?: string | null;
    discount?: number;
    tax?: number;
    items: LineIn[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const { items: rawItems, notes, discount: discountRaw, tax: taxRaw } = body;
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: "يجب أن تحتوي الفاتورة على بند واحد على الأقل" }, { status: 400 });
  }

  const discountAmount = Math.max(0, Number(discountRaw) || 0);
  const taxAmount = Math.max(0, Number(taxRaw) || 0);

  const normalized: { id?: string; item_id: string; quantity: number; unit_price: number; sale_price?: number }[] = [];
  for (const it of rawItems) {
    if (!it.item_id?.trim()) {
      return NextResponse.json({ error: "بند غير صالح: صنف مطلوب" }, { status: 400 });
    }
    const qty = Number(it.quantity);
    const up = Number(it.unit_price);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "بند غير صالح: الكمية يجب أن تكون أكبر من صفر" }, { status: 400 });
    }
    if (!Number.isFinite(up) || up < 0) {
      return NextResponse.json({ error: "بند غير صالح: سعر الوحدة غير صالح" }, { status: 400 });
    }
    const line: { id?: string; item_id: string; quantity: number; unit_price: number; sale_price?: number } = {
      item_id: it.item_id.trim(),
      quantity: qty,
      unit_price: up,
    };
    if (it.sale_price !== undefined && it.sale_price !== null) {
      const sp = Number(it.sale_price);
      if (!Number.isFinite(sp) || sp < 0) {
        return NextResponse.json({ error: "بند غير صالح: سعر البيع غير صالح" }, { status: 400 });
      }
      line.sale_price = sp;
    }
    if (it.id && String(it.id).trim()) line.id = String(it.id).trim();
    normalized.push(line);
  }

  try {
    const invResult = await db.execute({
      sql: `SELECT id, invoice_number, type, status, warehouse_id, paid_amount, is_return
            FROM invoices WHERE id = ? AND company_id = ?`,
      args: [invoiceId, companyId],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const inv = invResult.rows[0];
    if (String(inv.type ?? "") !== "purchase") {
      return NextResponse.json({ error: "التعديل متاح لفواتير الشراء فقط" }, { status: 400 });
    }
    if (Number(inv.is_return ?? 0) === 1) {
      return NextResponse.json({ error: "لا يمكن تعديل فاتورة مرتجع" }, { status: 400 });
    }
    const status = String(inv.status ?? "");
    if (status === "returned" || status === "cancelled") {
      return NextResponse.json({ error: "لا يمكن تعديل فاتورة مرتجعة أو ملغاة" }, { status: 400 });
    }
    if (Number(inv.paid_amount ?? 0) > 0) {
      return NextResponse.json(
        { error: "لا يمكن تعديل فاتورة شراء تم تسجيل دفعات عليها. أزل المدفوعات أولاً أو استخدم مرتجعاً." },
        { status: 400 }
      );
    }

    const warehouseId = inv.warehouse_id as string;
    if (!warehouseId) {
      return NextResponse.json({ error: "الفاتورة لا تحتوي على مخزن" }, { status: 400 });
    }

    const oldLinesResult = await db.execute({
      sql: `SELECT ii.id, ii.item_id, ii.quantity, ii.unit_price, ii.total, ii.sort_order
            FROM invoice_items ii WHERE ii.invoice_id = ? AND ii.item_id IS NOT NULL`,
      args: [invoiceId],
    });

    const oldLines = oldLinesResult.rows.map((r) => ({
      id: String(r.id),
      item_id: String(r.item_id),
      quantity: Number(r.quantity ?? 0),
      unit_price: Number(r.unit_price ?? 0),
      total: Number(r.total ?? 0),
      sort_order: Number(r.sort_order ?? 0),
    }));

    const oldById = new Map(oldLines.map((l) => [l.id, l]));

    for (const n of normalized) {
      if (n.id && !oldById.has(n.id)) {
        return NextResponse.json({ error: "معرّف بند غير موجود في هذه الفاتورة" }, { status: 400 });
      }
    }

    for (const n of normalized) {
      const itemCheck = await db.execute({
        sql: "SELECT id FROM items WHERE id = ? AND company_id = ?",
        args: [n.item_id, companyId],
      });
      if (itemCheck.rows.length === 0) {
        return NextResponse.json({ error: "صنف غير موجود" }, { status: 404 });
      }
    }

    if (body.supplier_id !== undefined && body.supplier_id !== null && String(body.supplier_id).trim()) {
      const sup = await db.execute({
        sql: "SELECT id FROM suppliers WHERE id = ? AND company_id = ?",
        args: [String(body.supplier_id).trim(), companyId],
      });
      if (sup.rows.length === 0) {
        return NextResponse.json({ error: "المورد غير موجود" }, { status: 400 });
      }
    }

    async function getStock(itemId: string): Promise<number> {
      const r = await db.execute({
        sql: "SELECT quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
        args: [itemId, warehouseId],
      });
      return r.rows[0] ? Number(r.rows[0].quantity ?? 0) : 0;
    }

    async function applyDelta(itemId: string, delta: number) {
      if (delta === 0) return;
      const smId = randomUUID();
      if (delta > 0) {
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, performed_by)
                VALUES (?, ?, ?, ?, 'in', 'invoice', ?, ?, ?)`,
          args: [smId, itemId, warehouseId, delta, invoiceId, "تعديل فاتورة شراء", userId],
        });
        const stockExisting = await db.execute({
          sql: "SELECT id FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
          args: [itemId, warehouseId],
        });
        if (stockExisting.rows.length > 0) {
          await db.execute({
            sql: "UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
            args: [delta, itemId, warehouseId],
          });
        } else {
          await db.execute({
            sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)",
            args: [randomUUID(), itemId, warehouseId, delta],
          });
        }
      } else {
        const need = -delta;
        const available = await getStock(itemId);
        if (available < need) {
          throw new Error(`STOCK:${itemId}:${available}:${need}`);
        }
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, performed_by)
                VALUES (?, ?, ?, ?, 'adjustment', 'invoice', ?, ?, ?)`,
          args: [smId, itemId, warehouseId, delta, invoiceId, "تعديل فاتورة شراء", userId],
        });
        await db.execute({
          sql: "UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
          args: [delta, itemId, warehouseId],
        });
      }
    }

    const newIds = new Set(normalized.filter((n) => n.id).map((n) => n.id!));
    for (const old of oldLines) {
      if (!newIds.has(old.id)) {
        await applyDelta(old.item_id, -old.quantity);
        await db.execute({ sql: "DELETE FROM invoice_items WHERE id = ?", args: [old.id] });
      }
    }

    for (let i = 0; i < normalized.length; i++) {
      const n = normalized[i];
      const total = n.quantity * n.unit_price;
      if (n.id) {
        const old = oldById.get(n.id)!;
        if (old.item_id !== n.item_id) {
          await applyDelta(old.item_id, -old.quantity);
          await applyDelta(n.item_id, n.quantity);
        } else {
          const dq = n.quantity - old.quantity;
          await applyDelta(n.item_id, dq);
        }
        await db.execute({
          sql: `UPDATE invoice_items SET item_id = ?, quantity = ?, unit_price = ?, total = ?, sort_order = ?, discount = 0
                WHERE id = ? AND invoice_id = ?`,
          args: [n.item_id, n.quantity, n.unit_price, total, i, n.id, invoiceId],
        });
      } else {
        await applyDelta(n.item_id, n.quantity);
        const iiId = randomUUID();
        await db.execute({
          sql: `INSERT INTO invoice_items (id, invoice_id, item_id, quantity, unit_price, discount, total, sort_order)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          args: [iiId, invoiceId, n.item_id, n.quantity, n.unit_price, total, i],
        });
      }
    }

    let subtotal = 0;
    for (const n of normalized) {
      subtotal += n.quantity * n.unit_price;
    }
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const afterTax = afterDiscount + taxAmount;
    const digitalFee = getPurchaseDigitalServiceFee(companyId);
    const finalTotal = afterTax + digitalFee;

    const supplierId =
      body.supplier_id === undefined
        ? undefined
        : body.supplier_id === null || String(body.supplier_id).trim() === ""
          ? null
          : String(body.supplier_id).trim();

    if (supplierId !== undefined) {
      await db.execute({
        sql: `UPDATE invoices SET supplier_id = ?, subtotal = ?, discount = ?, tax = ?, digital_service_fee = ?, total = ?, notes = ?, updated_at = datetime('now')
              WHERE id = ? AND company_id = ?`,
        args: [
          supplierId,
          subtotal,
          discountAmount,
          taxAmount,
          digitalFee,
          finalTotal,
          notes?.trim() || null,
          invoiceId,
          companyId,
        ],
      });
    } else {
      await db.execute({
        sql: `UPDATE invoices SET subtotal = ?, discount = ?, tax = ?, digital_service_fee = ?, total = ?, notes = ?, updated_at = datetime('now')
              WHERE id = ? AND company_id = ?`,
        args: [subtotal, discountAmount, taxAmount, digitalFee, finalTotal, notes?.trim() || null, invoiceId, companyId],
      });
    }

    for (const n of normalized) {
      if (n.sale_price !== undefined) {
        await db.execute({
          sql: "UPDATE items SET purchase_price = ?, sale_price = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [n.unit_price, n.sale_price, n.item_id, companyId],
        });
      } else {
        await db.execute({
          sql: "UPDATE items SET purchase_price = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [n.unit_price, n.item_id, companyId],
        });
      }
    }

    const invNum = String(inv.invoice_number ?? "");
    await logAudit({
      companyId,
      userId,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "invoice_update",
      entityType: "invoice",
      entityId: invoiceId,
      details: `تعديل فاتورة شراء ${invNum}`,
    });

    return NextResponse.json({
      ok: true,
      subtotal,
      discount: discountAmount,
      tax: taxAmount,
      digital_service_fee: digitalFee,
      total: finalTotal,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("STOCK:")) {
      const parts = msg.split(":");
      const available = parts[2];
      const need = parts[3];
      return NextResponse.json(
        { error: `الكمية في المخزن غير كافية لإنقاص البند (متاح: ${available}، مطلوب خصم: ${need})` },
        { status: 400 }
      );
    }
    console.error("Purchase invoice PATCH error:", e);
    return NextResponse.json({ error: "فشل في تعديل فاتورة الشراء" }, { status: 500 });
  }
}
