import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { getPurchaseDigitalServiceFee } from "@/lib/purchase-digital-fee";
import { WALLET_CHARGE_MESSAGE, walletInsufficientError } from "@/lib/wallet-charge-contact";
import { ensureCompanyWarehouse } from "@/lib/warehouse";
import { randomUUID } from "crypto";
import { allocateInvoiceNumber } from "@/lib/invoice-numbers";
import { logAudit } from "@/lib/audit";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { supplier_id, items, notes, discount, tax } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "يجب إضافة صنف واحد على الأقل" }, { status: 400 });
    }

    const warehouseId = await ensureCompanyWarehouse(companyId);

    for (const it of items) {
      if (!it.item_id || !it.quantity || Number(it.quantity) <= 0) {
        return NextResponse.json({ error: "بيانات الصنف غير صالحة" }, { status: 400 });
      }
    }

    const invoiceId = randomUUID();
    const invNum = await allocateInvoiceNumber(companyId, "purchase");

    let subtotal = 0;
    const validItems: { item_id: string; quantity: number; unit_price: number; total: number }[] = [];

    for (const it of items) {
      const itemId = it.item_id;
      const qty = Number(it.quantity);
      const unitPrice = Number(it.unit_price) || 0;
      const total = qty * unitPrice;
      subtotal += total;

      const itemResult = await db.execute({
        sql: "SELECT id FROM items WHERE id = ? AND company_id = ?",
        args: [itemId, companyId],
      });
      if (itemResult.rows.length === 0) {
        return NextResponse.json({ error: "صنف غير موجود" }, { status: 404 });
      }

      validItems.push({ item_id: itemId, quantity: qty, unit_price: unitPrice, total });
    }

    const discountAmount = Number(discount) || 0;
    const taxAmount = Number(tax) || 0;
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const afterTax = afterDiscount + taxAmount;
    const digitalFee = getPurchaseDigitalServiceFee(companyId);
    const finalTotal = afterTax + digitalFee;

    let walletRow: { id: string; balance: number } | null = null;
    if (digitalFee > 0) {
      const walletCheck = await db.execute({
        sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
        args: [companyId],
      });
      if (walletCheck.rows.length === 0) {
        return NextResponse.json(
          { error: `لا يمكن إصدار فاتورة الشراء: لا توجد محفظة للشركة. ${WALLET_CHARGE_MESSAGE}` },
          { status: 400 }
        );
      }
      const bal = Number(walletCheck.rows[0].balance ?? 0);
      if (bal < digitalFee) {
        return NextResponse.json(
          { error: walletInsufficientError(digitalFee, bal) },
          { status: 400 }
        );
      }
      walletRow = { id: String(walletCheck.rows[0].id), balance: bal };
    }

    const commitStmts: { sql: string; args: (string | number | null)[] }[] = [
      {
        sql: `INSERT INTO invoices (id, company_id, invoice_number, type, status, supplier_id, warehouse_id, subtotal, discount, tax, digital_service_fee, total, paid_amount, notes, created_by)
            VALUES (?, ?, ?, 'purchase', 'pending', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [
          invoiceId,
          companyId,
          invNum,
          supplier_id?.trim() || null,
          warehouseId,
          subtotal,
          discountAmount,
          taxAmount,
          digitalFee,
          finalTotal,
          notes?.trim() || null,
          session.user.id,
        ],
      },
    ];

    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      const smId = randomUUID();
      const iiId = randomUUID();

      commitStmts.push({
        sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, ?, 'in', 'invoice', ?, ?)`,
        args: [smId, it.item_id, warehouseId, it.quantity, invoiceId, session.user.id],
      });

      commitStmts.push({
        sql: `INSERT INTO invoice_items (id, invoice_id, item_id, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [iiId, invoiceId, it.item_id, it.quantity, it.unit_price, it.total, i],
      });

      commitStmts.push({
        sql: "UPDATE items SET purchase_price = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
        args: [it.unit_price, it.item_id, companyId],
      });

      commitStmts.push({
        sql: `UPDATE item_warehouse_stock SET quantity = quantity + ?, updated_at = datetime('now')
              WHERE item_id = ? AND warehouse_id = ?`,
        args: [it.quantity, it.item_id, warehouseId],
      });
      commitStmts.push({
        sql: `INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity)
              SELECT ?, ?, ?, ?
              WHERE NOT EXISTS (
                SELECT 1 FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?
              )`,
        args: [randomUUID(), it.item_id, warehouseId, it.quantity, it.item_id, warehouseId],
      });
    }

    if (digitalFee > 0 && walletRow) {
      commitStmts.push({
        sql: "UPDATE company_wallets SET balance = balance - ? WHERE company_id = ?",
        args: [digitalFee, companyId],
      });
      commitStmts.push({
        sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'digital_service', ?, 'invoice', ?, ?)`,
        args: [randomUUID(), walletRow.id, digitalFee, `خدمة رقمية - فاتورة شراء ${invNum}`, invoiceId, session.user.id],
      });
    }

    await db.batch(commitStmts, "write");

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "invoice_create",
      entityType: "invoice",
      entityId: invoiceId,
      details: `إنشاء فاتورة شراء ${invNum}`,
    });

    return NextResponse.json({
      id: invoiceId,
      invoice_number: invNum,
      total: finalTotal,
    });
  } catch (error) {
    console.error("Purchase invoice error:", error);
    return NextResponse.json({ error: "فشل في إنشاء فاتورة الشراء" }, { status: 500 });
  }
}
