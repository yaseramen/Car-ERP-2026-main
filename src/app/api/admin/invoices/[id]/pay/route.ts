import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { ensureTreasuries, getTreasuryIdByType } from "@/lib/treasuries";
import { getOrCreatePaymentWallet, type PaymentWalletChannel } from "@/lib/payment-wallets";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

function isDigitalMethodType(t: string): t is PaymentWalletChannel {
  return t === "vodafone_cash" || t === "instapay";
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

  const { id: invoiceId } = await params;

  try {
    const body = await request.json();
    const {
      amount,
      payment_method_id,
      reference_number,
      reference_from,
      reference_to,
      notes,
    } = body as {
      amount?: number;
      payment_method_id?: string;
      reference_number?: string;
      reference_from?: string;
      reference_to?: string;
      notes?: string;
    };

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" }, { status: 400 });
    }
    if (!payment_method_id) {
      return NextResponse.json({ error: "طريقة الدفع مطلوبة" }, { status: 400 });
    }

    const amt = Number(amount);

    const pmResult = await db.execute({
      sql: "SELECT type FROM payment_methods WHERE id = ?",
      args: [payment_method_id],
    });
    if (pmResult.rows.length === 0) {
      return NextResponse.json({ error: "طريقة الدفع غير موجودة" }, { status: 400 });
    }
    const methodType = String(pmResult.rows[0].type ?? "");

    const invResult = await db.execute({
      sql: "SELECT total, paid_amount, status, type, invoice_number, warehouse_id FROM invoices WHERE id = ? AND company_id = ?",
      args: [invoiceId, companyId],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }

    const inv = invResult.rows[0];
    const total = Number(inv.total ?? 0);
    const paidAmount = Number(inv.paid_amount ?? 0);
    const newPaid = paidAmount + amt;
    const invType = String(inv.type ?? "");
    const invNum = String(inv.invoice_number ?? "");

    if (newPaid > total) {
      return NextResponse.json({ error: `المبلغ يتجاوز المتبقي (${(total - paidAmount).toFixed(2)} ج.م)` }, { status: 400 });
    }

    const status = newPaid >= total ? "paid" : "partial";

    let treasuryId: string | null = null;
    let distributionTreasuryId: string | null = null;
    let paymentWalletId: string | null = null;

    const refFromRaw =
      typeof reference_from === "string" && reference_from.trim()
        ? reference_from.trim()
        : typeof reference_number === "string" && reference_number.trim()
          ? reference_number.trim()
          : "";
    const refToRaw = typeof reference_to === "string" ? reference_to.trim() : "";

    /** بيع/صيانة: محفظة استلام (إلى). شراء: محفظة دفع (من). */
    const useInboundDigitalWallet =
      isDigitalMethodType(methodType) && (invType === "sale" || invType === "maintenance");
    const useOutboundDigitalWallet = isDigitalMethodType(methodType) && invType === "purchase";

    if (useInboundDigitalWallet) {
      if (!refToRaw) {
        return NextResponse.json(
          { error: "أدخل رقم المحفظة أو الحساب المحول إليه (محفظة إلكترونية / إنستاباي)" },
          { status: 400 }
        );
      }
      try {
        const w = await getOrCreatePaymentWallet(companyId, methodType, refToRaw);
        paymentWalletId = w.id;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "رقم المحفظة غير صالح";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (useOutboundDigitalWallet) {
      if (!refFromRaw) {
        return NextResponse.json(
          { error: "اختر محفظة الشركة أو أدخل رقم الحساب المحوّل منه (دفع للمورد)" },
          { status: 400 }
        );
      }
      try {
        const w = await getOrCreatePaymentWallet(companyId, methodType, refFromRaw);
        paymentWalletId = w.id;
        const balRow = await db.execute({
          sql: "SELECT balance FROM payment_wallets WHERE id = ? AND company_id = ?",
          args: [paymentWalletId, companyId],
        });
        const pwBal = Number(balRow.rows[0]?.balance ?? 0);
        if (pwBal < amt) {
          return NextResponse.json(
            { error: `رصيد محفظة الدفع غير كافٍ (متاح: ${pwBal.toFixed(2)} ج.م)` },
            { status: 400 }
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "رقم محفظة الدفع غير صالح";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (invType === "sale" && inv.warehouse_id) {
      const dist = await db.execute({
        sql: "SELECT id FROM distribution_treasuries WHERE warehouse_id = ? AND company_id = ? LIMIT 1",
        args: [String(inv.warehouse_id), companyId],
      });
      if (dist.rows.length > 0) {
        distributionTreasuryId = String(dist.rows[0].id);
      }
    }

    await ensureTreasuries(companyId);

    if (invType === "sale" && distributionTreasuryId) {
      if (useInboundDigitalWallet && paymentWalletId) {
        await db.execute({
          sql: "UPDATE payment_wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [amt, paymentWalletId, companyId],
        });
        await db.execute({
          sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
          args: [
            randomUUID(),
            paymentWalletId,
            amt,
            `دفعة فاتورة ${invNum}`,
            invoiceId,
            payment_method_id,
            session.user.id,
          ],
        });
      } else {
        await db.execute({
          sql: "UPDATE distribution_treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
          args: [amt, distributionTreasuryId],
        });
        await db.execute({
          sql: `INSERT INTO distribution_treasury_transactions (id, distribution_treasury_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
              VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
          args: [randomUUID(), distributionTreasuryId, amt, `دفعة فاتورة ${invNum}`, invoiceId, payment_method_id, session.user.id],
        });
      }
    } else if (invType === "sale" || invType === "maintenance") {
      if (useInboundDigitalWallet && paymentWalletId) {
        await db.execute({
          sql: "UPDATE payment_wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [amt, paymentWalletId, companyId],
        });
        await db.execute({
          sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
          args: [
            randomUUID(),
            paymentWalletId,
            amt,
            `دفعة فاتورة ${invNum}`,
            invoiceId,
            payment_method_id,
            session.user.id,
          ],
        });
      } else {
        treasuryId = invType === "sale" ? await getTreasuryIdByType(companyId, "sales") : await getTreasuryIdByType(companyId, "workshop");
        if (treasuryId) {
          await db.execute({
            sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
            args: [amt, treasuryId],
          });
          await db.execute({
            sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
            args: [randomUUID(), treasuryId, amt, `دفعة فاتورة ${invNum}`, invoiceId, payment_method_id, session.user.id],
          });
        }
      }
    } else if (invType === "purchase") {
      if (useOutboundDigitalWallet && paymentWalletId) {
        await db.execute({
          sql: "UPDATE payment_wallets SET balance = balance - ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
          args: [amt, paymentWalletId, companyId],
        });
        await db.execute({
          sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'out', ?, 'invoice', ?, ?, ?)`,
          args: [
            randomUUID(),
            paymentWalletId,
            -amt,
            `دفعة شراء ${invNum}${refToRaw ? ` → ${refToRaw}` : ""}`,
            invoiceId,
            payment_method_id,
            session.user.id,
          ],
        });
      } else {
        treasuryId = await getTreasuryIdByType(companyId, "main");
        if (treasuryId) {
          const treasury = await db.execute({
            sql: "SELECT balance FROM treasuries WHERE id = ? AND company_id = ?",
            args: [treasuryId, companyId],
          });
          const balance = Number(treasury.rows[0]?.balance ?? 0);
          if (balance < amt) {
            return NextResponse.json({
              error: `رصيد الخزينة الرئيسية غير كافٍ (متاح: ${balance.toFixed(2)} ج.م)`,
            }, { status: 400 });
          }
          await db.execute({
            sql: "UPDATE treasuries SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
            args: [amt, treasuryId],
          });
          await db.execute({
            sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'out', ?, 'invoice', ?, ?, ?)`,
            args: [randomUUID(), treasuryId, -amt, `دفعة فاتورة شراء ${invNum}`, invoiceId, payment_method_id, session.user.id],
          });
        }
      }
    }

    const refFromDb = refFromRaw || null;
    const refToDb = refToRaw || null;
    const legacyRef =
      refFromDb && refToDb
        ? `من ${refFromDb} → إلى ${refToDb}`
        : refFromDb || refToDb || null;

    await db.execute({
      sql: `INSERT INTO invoice_payments (id, invoice_id, amount, payment_method_id, treasury_id, distribution_treasury_id, payment_wallet_id, reference_number, reference_from, reference_to, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        invoiceId,
        amt,
        payment_method_id,
        treasuryId,
        distributionTreasuryId,
        paymentWalletId,
        legacyRef,
        refFromDb,
        refToDb,
        typeof notes === "string" ? notes.trim() || null : null,
        session.user.id,
      ],
    });

    await db.execute({
      sql: "UPDATE invoices SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [newPaid, status, invoiceId, companyId],
    });

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "invoice_pay",
      entityType: "invoice",
      entityId: invoiceId,
      details: `دفع ${amt} ج.م — فاتورة ${invNum}`,
    });

    return NextResponse.json({ success: true, paid_amount: newPaid, status });
  } catch (error) {
    console.error("Payment error:", error);
    return NextResponse.json({ error: "فشل في تسجيل الدفع" }, { status: 500 });
  }
}
