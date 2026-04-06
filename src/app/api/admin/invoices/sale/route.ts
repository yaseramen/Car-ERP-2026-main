import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId, isPlatformOwnerCompany } from "@/lib/company";
import { resolveSaleWarehouseId } from "@/lib/distribution";
import { ensureTreasuries, getTreasuryIdByType } from "@/lib/treasuries";
import { getOrCreatePaymentWallet } from "@/lib/payment-wallets";
import { getDigitalFeeConfig, calcDigitalFee } from "@/lib/digital-fee";
import { WALLET_CHARGE_MESSAGE, walletInsufficientError } from "@/lib/wallet-charge-contact";
import { allocateInvoiceNumber } from "@/lib/invoice-numbers";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      customer_id,
      items,
      payment_method_id,
      paid_amount,
      discount,
      tax,
      notes,
      warehouse_id: bodyWarehouseId,
      reference_from,
      reference_to,
    } = body as {
      customer_id?: string;
      items?: unknown[];
      payment_method_id?: string;
      paid_amount?: number;
      discount?: number;
      tax?: number;
      notes?: string;
      warehouse_id?: string | null;
      reference_from?: string;
      reference_to?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "يجب إضافة صنف واحد على الأقل" }, { status: 400 });
    }

    const saleItems = items as { item_id: string; quantity: number }[];

    let warehouseId: string;
    let distributionTreasuryId: string | null = null;
    try {
      const resolved = await resolveSaleWarehouseId(
        companyId,
        session.user.id,
        session.user.role ?? "employee",
        typeof bodyWarehouseId === "string" ? bodyWarehouseId : null
      );
      warehouseId = resolved.warehouseId;
      distributionTreasuryId = resolved.distributionTreasuryId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "مخزن غير صالح";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    for (const it of saleItems) {
      if (!it.item_id || !it.quantity || Number(it.quantity) <= 0) {
        return NextResponse.json({ error: "بيانات الصنف غير صالحة" }, { status: 400 });
      }
    }

    const invoiceId = randomUUID();
    const invNum = await allocateInvoiceNumber(companyId, "sale");

    let subtotal = 0;
    const validItems: { item_id: string; quantity: number; unit_price: number; total: number; name: string }[] = [];

    for (const it of saleItems) {
      const itemId = it.item_id;
      const qty = Number(it.quantity);

      const stockResult = await db.execute({
        sql: "SELECT quantity FROM item_warehouse_stock WHERE item_id = ? AND warehouse_id = ?",
        args: [itemId, warehouseId],
      });
      const available = stockResult.rows[0] ? Number(stockResult.rows[0].quantity ?? 0) : 0;

      if (available < qty) {
        const itemNameResult = await db.execute({
          sql: "SELECT name FROM items WHERE id = ?",
          args: [itemId],
        });
        const itemName = itemNameResult.rows[0]?.name ?? "صنف";
        return NextResponse.json(
          { error: `الكمية المتاحة لـ "${itemName}" غير كافية (متاح: ${available})` },
          { status: 400 }
        );
      }

      const itemResult = await db.execute({
        sql: "SELECT sale_price, name FROM items WHERE id = ? AND company_id = ?",
        args: [itemId, companyId],
      });
      if (itemResult.rows.length === 0) {
        return NextResponse.json({ error: "صنف غير موجود" }, { status: 404 });
      }

      const unitPrice = Number(itemResult.rows[0].sale_price ?? 0);
      const total = qty * unitPrice;
      subtotal += total;
      validItems.push({
        item_id: itemId,
        quantity: qty,
        unit_price: unitPrice,
        total,
        name: String(itemResult.rows[0].name ?? ""),
      });
    }

    const discountAmount = Number(discount) || 0;
    const taxAmount = Number(tax) || 0;
    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const afterTax = afterDiscount + taxAmount;
    const feeConfig = await getDigitalFeeConfig(companyId);
    const digitalFee = isPlatformOwnerCompany(companyId)
      ? 0
      : calcDigitalFee(afterTax, feeConfig);
    const total = afterTax + digitalFee;
    const paid = Number(paid_amount ?? 0);
    const status = paid >= total ? "paid" : paid > 0 ? "partial" : "pending";

    let walletRow: { id: string; balance: number } | null = null;
    if (digitalFee > 0) {
      const walletCheck = await db.execute({
        sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
        args: [companyId],
      });
      if (walletCheck.rows.length === 0) {
        return NextResponse.json(
          { error: `لا يمكن إصدار الفاتورة: لا توجد محفظة للشركة. ${WALLET_CHARGE_MESSAGE}` },
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

    let salesTreasuryId: string | null = null;
    if (paid > 0) {
      if (!payment_method_id) {
        return NextResponse.json({ error: "يجب اختيار طريقة الدفع عند تسجيل مبلغ مدفوع." }, { status: 400 });
      }
      if (!distributionTreasuryId) {
        await ensureTreasuries(companyId);
        salesTreasuryId = await getTreasuryIdByType(companyId, "sales");
        if (!salesTreasuryId) {
          return NextResponse.json(
            { error: "لا يمكن تسجيل الدفع: خزينة المبيعات غير متاحة. تأكد من إعداد الخزائن في الإعدادات." },
            { status: 400 }
          );
        }
      }
    }

    let paymentWalletIdForInsert: string | null = null;
    let refFromDb: string | null = null;
    let refToDb: string | null = null;
    let legacyRef: string | null = null;

    if (paid > 0 && payment_method_id) {
      const pmRow = await db.execute({
        sql: "SELECT type FROM payment_methods WHERE id = ?",
        args: [payment_method_id],
      });
      const pmType = pmRow.rows[0] ? String(pmRow.rows[0].type ?? "") : "";
      const isDigital = pmType === "vodafone_cash" || pmType === "instapay";
      const refFromRaw = typeof reference_from === "string" ? reference_from.trim() : "";
      const refToRaw = typeof reference_to === "string" ? reference_to.trim() : "";
      refFromDb = refFromRaw || null;
      refToDb = refToRaw || null;
      if (refFromDb && refToDb) legacyRef = `من ${refFromDb} → إلى ${refToDb}`;
      else legacyRef = refFromDb || refToDb || null;

      if (
        isDigital &&
        paid > 0 &&
        (distributionTreasuryId || salesTreasuryId) &&
        refToRaw.length === 0
      ) {
        return NextResponse.json(
          { error: "أدخل رقم المحفظة أو الحساب المحول إليه (محفظة إلكترونية / إنستاباي)" },
          { status: 400 }
        );
      }

      const canUseWallet =
        isDigital &&
        refToRaw.length > 0 &&
        (distributionTreasuryId || salesTreasuryId);

      if (canUseWallet) {
        try {
          const w = await getOrCreatePaymentWallet(companyId, pmType as "vodafone_cash" | "instapay", refToRaw);
          paymentWalletIdForInsert = w.id;
        } catch (e) {
          return NextResponse.json(
            { error: e instanceof Error ? e.message : "رقم المحفظة غير صالح" },
            { status: 400 }
          );
        }
      }
    }

    const commitStmts: { sql: string; args: (string | number | null)[] }[] = [
      {
        sql: `INSERT INTO invoices (id, company_id, invoice_number, type, status, customer_id, warehouse_id, subtotal, discount, tax, digital_service_fee, total, paid_amount, notes, created_by)
            VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          invoiceId,
          companyId,
          invNum,
          status,
          customer_id?.trim() || null,
          warehouseId,
          subtotal,
          discountAmount,
          taxAmount,
          digitalFee,
          total,
          paid,
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
              VALUES (?, ?, ?, ?, 'out', 'invoice', ?, ?)`,
        args: [smId, it.item_id, warehouseId, -it.quantity, invoiceId, session.user.id],
      });
      commitStmts.push({
        sql: "UPDATE item_warehouse_stock SET quantity = quantity - ?, updated_at = datetime('now') WHERE item_id = ? AND warehouse_id = ?",
        args: [it.quantity, it.item_id, warehouseId],
      });
      commitStmts.push({
        sql: "INSERT INTO invoice_items (id, invoice_id, item_id, quantity, unit_price, total, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [iiId, invoiceId, it.item_id, it.quantity, it.unit_price, it.total, i],
      });
    }

    if (paid > 0 && payment_method_id) {
      const payTxId = randomUUID();
      const payId = randomUUID();
      if (distributionTreasuryId) {
        if (paymentWalletIdForInsert) {
          commitStmts.push({
            sql: "UPDATE payment_wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
            args: [paid, paymentWalletIdForInsert, companyId],
          });
          commitStmts.push({
            sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                  VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
            args: [
              payTxId,
              paymentWalletIdForInsert,
              paid,
              `فاتورة بيع ${invNum}`,
              invoiceId,
              payment_method_id,
              session.user.id,
            ],
          });
          commitStmts.push({
            sql: `INSERT INTO invoice_payments (id, invoice_id, amount, payment_method_id, treasury_id, distribution_treasury_id, payment_wallet_id, reference_number, reference_from, reference_to, created_by)
                  VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
            args: [
              payId,
              invoiceId,
              paid,
              payment_method_id,
              distributionTreasuryId,
              paymentWalletIdForInsert,
              legacyRef,
              refFromDb,
              refToDb,
              session.user.id,
            ],
          });
        } else {
          commitStmts.push({
            sql: "UPDATE distribution_treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
            args: [paid, distributionTreasuryId],
          });
          commitStmts.push({
            sql: `INSERT INTO distribution_treasury_transactions (id, distribution_treasury_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
            args: [payTxId, distributionTreasuryId, paid, `فاتورة بيع ${invNum}`, invoiceId, payment_method_id, session.user.id],
          });
          commitStmts.push({
            sql: `INSERT INTO invoice_payments (id, invoice_id, amount, payment_method_id, treasury_id, distribution_treasury_id, created_by)
                VALUES (?, ?, ?, ?, NULL, ?, ?)`,
            args: [payId, invoiceId, paid, payment_method_id, distributionTreasuryId, session.user.id],
          });
        }
      } else if (salesTreasuryId) {
        if (paymentWalletIdForInsert) {
          commitStmts.push({
            sql: "UPDATE payment_wallets SET balance = balance + ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
            args: [paid, paymentWalletIdForInsert, companyId],
          });
          commitStmts.push({
            sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                  VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
            args: [
              payTxId,
              paymentWalletIdForInsert,
              paid,
              `فاتورة بيع ${invNum}`,
              invoiceId,
              payment_method_id,
              session.user.id,
            ],
          });
          commitStmts.push({
            sql: `INSERT INTO invoice_payments (id, invoice_id, amount, payment_method_id, treasury_id, distribution_treasury_id, payment_wallet_id, reference_number, reference_from, reference_to, created_by)
                  VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
            args: [
              payId,
              invoiceId,
              paid,
              payment_method_id,
              paymentWalletIdForInsert,
              legacyRef,
              refFromDb,
              refToDb,
              session.user.id,
            ],
          });
        } else {
          commitStmts.push({
            sql: "UPDATE treasuries SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?",
            args: [paid, salesTreasuryId],
          });
          commitStmts.push({
            sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by)
                VALUES (?, ?, ?, 'in', ?, 'invoice', ?, ?, ?)`,
            args: [payTxId, salesTreasuryId, paid, `فاتورة بيع ${invNum}`, invoiceId, payment_method_id, session.user.id],
          });
          commitStmts.push({
            sql: `INSERT INTO invoice_payments (id, invoice_id, amount, payment_method_id, treasury_id, distribution_treasury_id, created_by)
                VALUES (?, ?, ?, ?, ?, NULL, ?)`,
            args: [payId, invoiceId, paid, payment_method_id, salesTreasuryId, session.user.id],
          });
        }
      }
    }

    if (digitalFee > 0 && walletRow) {
      commitStmts.push({
        sql: "UPDATE company_wallets SET balance = balance - ? WHERE company_id = ?",
        args: [digitalFee, companyId],
      });
      commitStmts.push({
        sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'digital_service', ?, 'invoice', ?, ?)`,
        args: [randomUUID(), walletRow.id, digitalFee, `خدمة رقمية - فاتورة ${invNum}`, invoiceId, session.user.id],
      });
    }

    await db.batch(commitStmts, "write");

    const issuerName = session.user.name ?? session.user.email ?? undefined;
    await logAudit({
      companyId,
      userId: session.user.id,
      userName: issuerName,
      action: "invoice_create",
      entityType: "invoice",
      entityId: invoiceId,
      details: `إنشاء فاتورة بيع ${invNum}`,
    });

    return NextResponse.json({
      id: invoiceId,
      invoice_number: invNum,
      total,
      status,
    });
  } catch (error) {
    console.error("Sale invoice error:", error);
    return NextResponse.json({ error: "فشل في إنشاء الفاتورة" }, { status: 500 });
  }
}
