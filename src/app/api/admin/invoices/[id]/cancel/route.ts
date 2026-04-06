import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
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
      sql: `SELECT id, invoice_number, type, status, warehouse_id, repair_order_id
            FROM invoices WHERE id = ? AND company_id = ?`,
      args: [invoiceId, companyId],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const inv = invResult.rows[0];
    const status = String(inv.status ?? "");
    const invType = String(inv.type ?? "");

    if (status === "cancelled") {
      return NextResponse.json({ error: "الفاتورة ملغاة مسبقاً" }, { status: 400 });
    }

    const warehouseId = inv.warehouse_id as string | null;
    const invNum = String(inv.invoice_number ?? "");
    const repairOrderId = inv.repair_order_id ? String(inv.repair_order_id) : null;

    const itemsResult = await db.execute({
      sql: "SELECT item_id, quantity FROM invoice_items WHERE invoice_id = ? AND item_id IS NOT NULL",
      args: [invoiceId],
    });

    if (warehouseId && itemsResult.rows.length > 0) {
      for (const row of itemsResult.rows) {
        const itemId = row.item_id as string;
        const qty = Number(row.quantity ?? 0);
        if (qty <= 0) continue;

        const smId = randomUUID();
        if (invType === "purchase") {
          const stockResult = await db.execute({
            sql: "SELECT quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
            args: [itemId, warehouseId],
          });
          const available = stockResult.rows[0] ? Number(stockResult.rows[0].quantity ?? 0) : 0;
          if (available < qty) {
            return NextResponse.json(
              { error: `الكمية المتاحة للصنف غير كافية للإلغاء (متاح: ${available})` },
              { status: 400 }
            );
          }
          await db.execute({
            sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
                  VALUES (?, ?, ?, ?, 'return', 'invoice_cancel', ?, ?)`,
            args: [smId, itemId, warehouseId, -qty, invoiceId, session.user.id],
          });
          await db.execute({
            sql: "UPDATE item_warehouse_stock SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
            args: [qty, itemId, warehouseId],
          });
        } else {
          await db.execute({
            sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, performed_by)
                  VALUES (?, ?, ?, ?, 'return', 'invoice_cancel', ?, ?)`,
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
    }

    const paymentsResult = await db.execute({
      sql: "SELECT amount, treasury_id, distribution_treasury_id, payment_wallet_id FROM invoice_payments WHERE invoice_id = ?",
      args: [invoiceId],
    });

    for (const row of paymentsResult.rows) {
      const amt = Number(row.amount ?? 0);
      if (amt <= 0) continue;

      const walletId = row.payment_wallet_id ? String(row.payment_wallet_id) : null;
      if (walletId) {
        await db.execute({
          sql: "UPDATE payment_wallets SET balance = balance - ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [amt, walletId, companyId],
        });
        await db.execute({
          sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, 'out', ?, 'invoice_cancel', ?, ?)`,
          args: [randomUUID(), walletId, -amt, `إلغاء فاتورة ${invNum}`, invoiceId, session.user.id],
        });
        continue;
      }

      const distId = row.distribution_treasury_id ? String(row.distribution_treasury_id) : null;
      if (distId && (invType === "sale" || invType === "maintenance")) {
        await db.execute({
          sql: "UPDATE distribution_treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [amt, distId, companyId],
        });
        await db.execute({
          sql: `INSERT INTO distribution_treasury_transactions (id, distribution_treasury_id, amount, type, description, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, 'out', ?, 'invoice_cancel', ?, ?)`,
          args: [randomUUID(), distId, -amt, `إلغاء فاتورة ${invNum}`, invoiceId, session.user.id],
        });
        continue;
      }

      const tid = row.treasury_id ? String(row.treasury_id) : null;
      if (tid) {
        const isPurchaseRefund = invType === "purchase";
        const balanceDelta = isPurchaseRefund ? amt : -amt;
        const txAmount = isPurchaseRefund ? amt : -amt;
        const txType = isPurchaseRefund ? "in" : "out";
        await db.execute({
          sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
          args: [balanceDelta, tid],
        });
        await db.execute({
          sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
                VALUES (?, ?, ?, ?, ?, 'invoice_cancel', ?, ?)`,
          args: [randomUUID(), tid, txAmount, txType, `إلغاء فاتورة ${invNum}`, invoiceId, session.user.id],
        });
      }
    }

    /* سياسة المنصة: رسوم الخدمة الرقمية لا تُعاد للمحفظة عند الإلغاء (تم خصمها عند الإصدار). */

    await db.execute({
      sql: "UPDATE invoices SET status = 'cancelled', paid_amount = 0, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [invoiceId, companyId],
    });

    if (repairOrderId) {
      await db.execute({
        sql: "UPDATE repair_orders SET invoice_id = NULL, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
        args: [repairOrderId, companyId],
      });
    }

    return NextResponse.json({ success: true, message: "تم إلغاء الفاتورة وإرجاع الأصناف للمخزن" });
  } catch (error) {
    console.error("Invoice cancel error:", error);
    return NextResponse.json({ error: "فشل في إلغاء الفاتورة" }, { status: 500 });
  }
}
