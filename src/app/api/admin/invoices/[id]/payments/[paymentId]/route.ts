import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/**
 * حذف دفعة مسجّلة على فاتورة شراء وإعادة المبلغ للخزينة الرئيسية
 * (لتمكين تعديل الفاتورة بعد أن يصبح المدفوع = 0)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const userId = session.user.id;
  const { id: invoiceId, paymentId } = await params;

  try {
    const payResult = await db.execute({
      sql: `SELECT ip.id, ip.amount, ip.treasury_id, ip.invoice_id,
            inv.company_id, inv.type, inv.status, inv.invoice_number, inv.total, inv.paid_amount
            FROM invoice_payments ip
            JOIN invoices inv ON ip.invoice_id = inv.id
            WHERE ip.id = ? AND inv.id = ?`,
      args: [paymentId, invoiceId],
    });

    if (payResult.rows.length === 0) {
      return NextResponse.json({ error: "الدفعة غير موجودة" }, { status: 404 });
    }

    const row = payResult.rows[0];
    if (String(row.company_id) !== companyId) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }

    const invType = String(row.type ?? "");
    if (invType !== "purchase") {
      return NextResponse.json({ error: "حذف الدفعة متاح لفواتير الشراء فقط حالياً" }, { status: 400 });
    }

    const status = String(row.status ?? "");
    if (status === "returned" || status === "cancelled") {
      return NextResponse.json({ error: "لا يمكن تعديل دفعات فاتورة مرتجعة أو ملغاة" }, { status: 400 });
    }

    const amt = Number(row.amount ?? 0);
    if (amt <= 0) {
      return NextResponse.json({ error: "مبلغ الدفعة غير صالح" }, { status: 400 });
    }

    const treasuryId = row.treasury_id ? String(row.treasury_id) : null;
    if (!treasuryId) {
      return NextResponse.json({ error: "لا يمكن عكس الدفعة: لم تُربَط بخزينة" }, { status: 400 });
    }

    const total = Number(row.total ?? 0);
    const paidAmount = Number(row.paid_amount ?? 0);
    const invNum = String(row.invoice_number ?? "");
    const newPaid = Math.max(0, paidAmount - amt);

    if (newPaid > total + 0.0001) {
      return NextResponse.json({ error: "خطأ في أرصدة الفاتورة" }, { status: 400 });
    }

    let newStatus: string;
    if (newPaid <= 0) {
      newStatus = "pending";
    } else if (newPaid >= total - 0.0001) {
      newStatus = "paid";
    } else {
      newStatus = "partial";
    }

    await db.execute({
      sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [amt, treasuryId, companyId],
    });

    await db.execute({
      sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'in', ?, 'payment_void', ?, ?)`,
      args: [
        randomUUID(),
        treasuryId,
        amt,
        `عكس دفعة فاتورة شراء ${invNum}`,
        paymentId,
        userId,
      ],
    });

    await db.execute({
      sql: "DELETE FROM invoice_payments WHERE id = ? AND invoice_id = ?",
      args: [paymentId, invoiceId],
    });

    await db.execute({
      sql: "UPDATE invoices SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [newPaid, newStatus, invoiceId, companyId],
    });

    await logAudit({
      companyId,
      userId,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "invoice_pay",
      entityType: "invoice",
      entityId: invoiceId,
      details: `حذف دفعة ${amt.toFixed(2)} ج.م — فاتورة شراء ${invNum}`,
    });

    return NextResponse.json({ success: true, paid_amount: newPaid, status: newStatus });
  } catch (e) {
    console.error("Delete payment error:", e);
    return NextResponse.json({ error: "فشل في حذف الدفعة" }, { status: 500 });
  }
}
