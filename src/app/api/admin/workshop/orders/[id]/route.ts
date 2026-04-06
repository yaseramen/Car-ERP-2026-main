import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId, isPlatformOwnerCompany } from "@/lib/company";
import { randomUUID } from "crypto";
import { WALLET_CHARGE_MESSAGE, walletInsufficientError } from "@/lib/wallet-charge-contact";
import { allocateInvoiceNumber } from "@/lib/invoice-numbers";
import { logAudit } from "@/lib/audit";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { stage, inspection_notes, estimated_completion } = body;

    const stages = ["received", "inspection", "maintenance", "ready", "completed"];
    if (!stage || !stages.includes(stage)) {
      return NextResponse.json({ error: "مرحلة غير صالحة" }, { status: 400 });
    }

    if (stage === "completed") {
      const orderResult = await db.execute({
        sql: `SELECT ro.order_number, ro.warehouse_id, ro.customer_id, ro.order_type, ro.invoice_id, inv.invoice_number AS existing_invoice_number
              FROM repair_orders ro
              LEFT JOIN invoices inv ON ro.invoice_id = inv.id
              WHERE ro.id = ? AND ro.company_id = ?`,
        args: [id, companyId],
      });
      if (orderResult.rows.length === 0) {
        return NextResponse.json({ error: "أمر غير موجود" }, { status: 404 });
      }

      const existingInvId = orderResult.rows[0].invoice_id ? String(orderResult.rows[0].invoice_id) : null;
      const existingInvNum = orderResult.rows[0].existing_invoice_number
        ? String(orderResult.rows[0].existing_invoice_number)
        : null;
      if (existingInvId && existingInvNum) {
        return NextResponse.json({
          success: true,
          invoice_id: existingInvId,
          invoice_number: existingInvNum,
          already_completed: true,
        });
      }

      const itemsResult = await db.execute({
        sql: "SELECT item_id, quantity, unit_price, total FROM repair_order_items WHERE repair_order_id = ?",
        args: [id],
      });

      const servicesResult = await db.execute({
        sql: "SELECT description, quantity, unit_price, total FROM repair_order_services WHERE repair_order_id = ?",
        args: [id],
      });

      const invoiceId = randomUUID();
      const invNum = await allocateInvoiceNumber(companyId, "sale");
      let subtotal = 0;
      for (const row of itemsResult.rows) {
        subtotal += Number(row.total ?? 0);
      }
      for (const row of servicesResult.rows) {
        subtotal += Number(row.total ?? 0);
      }

      const order = orderResult.rows[0];
      const customerId = order.customer_id || null;
      const orderType = order.order_type ?? "maintenance";

      if (
        orderType === "maintenance" &&
        itemsResult.rows.length === 0 &&
        servicesResult.rows.length === 0
      ) {
        return NextResponse.json(
          { error: "لا يمكن إصدار فاتورة: أضف قطعة أو خدمة على الأقل قبل الإكمال." },
          { status: 400 }
        );
      }

      const { getDigitalFeeConfig, calcDigitalFee } = await import("@/lib/digital-fee");
      const feeConfig = await getDigitalFeeConfig(companyId);
      const digitalFeePreview = isPlatformOwnerCompany(companyId)
        ? 0
        : calcDigitalFee(subtotal, feeConfig);

      if (digitalFeePreview > 0 && !isPlatformOwnerCompany(companyId)) {
        const walletCheck = await db.execute({
          sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
          args: [companyId],
        });
        if (walletCheck.rows.length === 0) {
          return NextResponse.json(
            { error: `لا يمكن إتمام أمر الصيانة: لا توجد محفظة للشركة. ${WALLET_CHARGE_MESSAGE}` },
            { status: 400 }
          );
        }
        const bal = Number(walletCheck.rows[0].balance ?? 0);
        if (bal < digitalFeePreview) {
          return NextResponse.json(
            { error: walletInsufficientError(digitalFeePreview, bal) },
            { status: 400 }
          );
        }
      }

      subtotal = 0;

      await db.execute({
        sql: `INSERT INTO invoices (id, company_id, invoice_number, type, status, customer_id, repair_order_id, warehouse_id, subtotal, total, paid_amount, created_by)
              VALUES (?, ?, ?, 'maintenance', 'pending', ?, ?, ?, 0, 0, 0, ?)`,
        args: [invoiceId, companyId, invNum, customerId, id, order.warehouse_id, session.user.id],
      });

      let sortOrder = 0;

      for (let i = 0; i < itemsResult.rows.length; i++) {
        const item = itemsResult.rows[i];
        const itemTotal = Number(item.total ?? 0);
        subtotal += itemTotal;
        await db.execute({
          sql: "INSERT INTO invoice_items (id, invoice_id, item_id, description, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [randomUUID(), invoiceId, item.item_id, null, item.quantity, item.unit_price, itemTotal, sortOrder++],
        });
      }
      for (let i = 0; i < servicesResult.rows.length; i++) {
        const svc = servicesResult.rows[i];
        const svcTotal = Number(svc.total ?? 0);
        subtotal += svcTotal;
        await db.execute({
          sql: "INSERT INTO invoice_items (id, invoice_id, item_id, description, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          args: [randomUUID(), invoiceId, null, svc.description, svc.quantity, svc.unit_price, svcTotal, sortOrder++],
        });
      }

      if (orderType === "inspection" && itemsResult.rows.length === 0 && servicesResult.rows.length === 0) {
        await db.execute({
          sql: "INSERT INTO invoice_items (id, invoice_id, item_id, description, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, 1, 0, 0, ?)",
          args: [randomUUID(), invoiceId, null, "فحص قبل البيع/الشراء", sortOrder++],
        });
      }

      const digitalFee = digitalFeePreview;
      const total = subtotal + digitalFee;

      await db.execute({
        sql: "UPDATE invoices SET subtotal = ?, digital_service_fee = ?, total = ? WHERE id = ?",
        args: [subtotal, digitalFee, total, invoiceId],
      });

      await db.execute({
        sql: "UPDATE repair_orders SET stage = 'completed', completed_at = datetime('now'), invoice_id = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
        args: [invoiceId, id, companyId],
      });

      if (digitalFee > 0 && !isPlatformOwnerCompany(companyId)) {
        const walletResult = await db.execute({
          sql: "SELECT id FROM company_wallets WHERE company_id = ?",
          args: [companyId],
        });
        if (walletResult.rows.length > 0) {
          await db.execute({
            sql: "UPDATE company_wallets SET balance = balance - ? WHERE company_id = ?",
            args: [digitalFee, companyId],
          });
          await db.execute({
            sql: "INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by) VALUES (?, ?, ?, 'digital_service', ?, 'invoice', ?, ?)",
            args: [randomUUID(), walletResult.rows[0].id, digitalFee, `خدمة رقمية - فاتورة ${invNum}`, invoiceId, session.user.id],
          });
        }
      }

      await logAudit({
        companyId,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? undefined,
        action: "invoice_create",
        entityType: "invoice",
        entityId: invoiceId,
        details: `إنشاء فاتورة صيانة ${invNum} من أمر الإصلاح`,
      });

      return NextResponse.json({ success: true, invoice_id: invoiceId, invoice_number: invNum });
    }

    const updates: string[] = ["stage = ?", "updated_at = datetime('now')"];
    const args: (string | number | null)[] = [stage];

    if (inspection_notes !== undefined) {
      updates.push("inspection_notes = ?");
      args.push(inspection_notes);
    }
    if (estimated_completion !== undefined) {
      updates.push("estimated_completion = ?");
      args.push(estimated_completion);
    }

    args.push(id, companyId);

    await db.execute({
      sql: `UPDATE repair_orders SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`,
      args: args as (string | number)[],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Order update error:", error);
    return NextResponse.json({ error: "فشل في التحديث" }, { status: 500 });
  }
}
