/**
 * كشف حساب مبسّط لعميل أو مورد من جدول الفواتير.
 */

import { db } from "@/lib/db/client";

function typeLabel(t: string): string {
  if (t === "sale") return "بيع";
  if (t === "purchase") return "شراء";
  if (t === "maintenance") return "صيانة";
  return t;
}

export async function answerCustomerStatement(
  companyId: string,
  customerId: string,
  displayName: string
): Promise<string> {
  const inv = await db.execute({
    sql: `SELECT invoice_number, type, status, total, paid_amount, IFNULL(is_return,0) as is_ret,
                 datetime(created_at) as created_at
          FROM invoices
          WHERE company_id = ? AND customer_id = ? AND status != 'cancelled'
          ORDER BY datetime(created_at) DESC
          LIMIT 15`,
    args: [companyId, customerId],
  });

  const sumRes = await db.execute({
    sql: `SELECT COUNT(*) as n,
                 COALESCE(SUM(total), 0) as sum_total,
                 COALESCE(SUM(paid_amount), 0) as sum_paid
          FROM invoices
          WHERE company_id = ? AND customer_id = ? AND status != 'cancelled'`,
    args: [companyId, customerId],
  });

  const n = Number(sumRes.rows[0]?.n ?? 0);
  const sumTotal = Number(sumRes.rows[0]?.sum_total ?? 0);
  const sumPaid = Number(sumRes.rows[0]?.sum_paid ?? 0);
  const balance = sumTotal - sumPaid;

  const lines: string[] = [];
  lines.push(`كشف حساب عميل: ${displayName}`);
  lines.push(`• إجمالي الفواتير (غير الملغاة): ${sumTotal.toFixed(2)} ج.م`);
  lines.push(`• إجمالي المدفوع المسجّل: ${sumPaid.toFixed(2)} ج.م`);
  lines.push(`• الفارق (إجمالي − مدفوع): ${balance.toFixed(2)} ج.م`);
  lines.push(`• عدد الفواتير: ${n}`);
  lines.push("");

  if (inv.rows.length === 0) {
    lines.push("لا توجد فواتير مرتبطة بهذا العميل.");
    return lines.join("\n");
  }

  lines.push("آخر الفواتير (حتى 15):");
  for (const r of inv.rows) {
    const num = String(r.invoice_number ?? "");
    const typ = typeLabel(String(r.type ?? ""));
    const st = String(r.status ?? "");
    const tot = Number(r.total ?? 0);
    const paid = Number(r.paid_amount ?? 0);
    const ret = Number(r.is_ret ?? 0) === 1 ? " [مرتجع]" : "";
    const dt = String(r.created_at ?? "");
    const diff = tot - paid;
    lines.push(`• ${num} — ${typ}${ret} — ${st} — إجمالي ${tot.toFixed(2)} — مدفوع ${paid.toFixed(2)} — متبقٍ ${diff.toFixed(2)} — ${dt}`);
  }
  lines.push("\n(الرقم «متبقٍ» يُحسب من إجمالي الفاتورة − المدفوع المسجّل على نفس الفاتورة.)");
  return lines.join("\n");
}

export async function answerSupplierStatement(
  companyId: string,
  supplierId: string,
  displayName: string
): Promise<string> {
  const inv = await db.execute({
    sql: `SELECT invoice_number, type, status, total, paid_amount, IFNULL(is_return,0) as is_ret,
                 datetime(created_at) as created_at
          FROM invoices
          WHERE company_id = ? AND supplier_id = ? AND status != 'cancelled'
          ORDER BY datetime(created_at) DESC
          LIMIT 15`,
    args: [companyId, supplierId],
  });

  const sumRes = await db.execute({
    sql: `SELECT COUNT(*) as n,
                 COALESCE(SUM(total), 0) as sum_total,
                 COALESCE(SUM(paid_amount), 0) as sum_paid
          FROM invoices
          WHERE company_id = ? AND supplier_id = ? AND status != 'cancelled'`,
    args: [companyId, supplierId],
  });

  const n = Number(sumRes.rows[0]?.n ?? 0);
  const sumTotal = Number(sumRes.rows[0]?.sum_total ?? 0);
  const sumPaid = Number(sumRes.rows[0]?.sum_paid ?? 0);
  const balance = sumTotal - sumPaid;

  const lines: string[] = [];
  lines.push(`كشف حساب مورد: ${displayName}`);
  lines.push(`• إجمالي فواتير الشراء (غير الملغاة): ${sumTotal.toFixed(2)} ج.م`);
  lines.push(`• إجمالي المدفوع المسجّل: ${sumPaid.toFixed(2)} ج.م`);
  lines.push(`• الفارق (إجمالي − مدفوع): ${balance.toFixed(2)} ج.م`);
  lines.push(`• عدد الفواتير: ${n}`);
  lines.push("");

  if (inv.rows.length === 0) {
    lines.push("لا توجد فواتير شراء مرتبطة بهذا المورد.");
    return lines.join("\n");
  }

  lines.push("آخر الفواتير (حتى 15):");
  for (const r of inv.rows) {
    const num = String(r.invoice_number ?? "");
    const typ = typeLabel(String(r.type ?? ""));
    const st = String(r.status ?? "");
    const tot = Number(r.total ?? 0);
    const paid = Number(r.paid_amount ?? 0);
    const ret = Number(r.is_ret ?? 0) === 1 ? " [مرتجع]" : "";
    const dt = String(r.created_at ?? "");
    const diff = tot - paid;
    lines.push(`• ${num} — ${typ}${ret} — ${st} — إجمالي ${tot.toFixed(2)} — مدفوع ${paid.toFixed(2)} — متبقٍ ${diff.toFixed(2)} — ${dt}`);
  }
  lines.push("\n(الرقم «متبقٍ» يُحسب من إجمالي الفاتورة − المدفوع المسجّل على نفس الفاتورة.)");
  return lines.join("\n");
}
