import { db } from "@/lib/db/client";

export type InvoiceSeqType = "sale" | "purchase";

const PREFIX: Record<InvoiceSeqType, string> = {
  sale: "INV",
  purchase: "PUR",
};

/**
 * يخصص رقم فاتورة التالي بشكل ذري (آمن مع الطلبات المتزامنة).
 */
export async function allocateInvoiceNumber(companyId: string, seqType: InvoiceSeqType): Promise<string> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO invoice_number_sequences (company_id, seq_type, next_num, updated_at)
          VALUES (?, ?, 1, datetime('now'))`,
    args: [companyId, seqType],
  });

  const result = await db.execute({
    sql: `UPDATE invoice_number_sequences
          SET next_num = next_num + 1, updated_at = datetime('now')
          WHERE company_id = ? AND seq_type = ?
          RETURNING next_num - 1 AS n`,
    args: [companyId, seqType],
  });

  const n = Number(result.rows[0]?.n ?? 0);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("فشل تخصيص رقم الفاتورة");
  }

  const prefix = PREFIX[seqType];
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * رقم فاتورة مرتجع جزئي: RET-{رقم الفاتورة الأصلية}-{تسلسل}
 */
export async function allocateReturnInvoiceNumber(
  companyId: string,
  originalInvoiceId: string,
  originalInvoiceNumber: string
): Promise<string> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO invoice_return_sequences (company_id, original_invoice_id, next_num, updated_at)
          VALUES (?, ?, 1, datetime('now'))`,
    args: [companyId, originalInvoiceId],
  });

  const result = await db.execute({
    sql: `UPDATE invoice_return_sequences
          SET next_num = next_num + 1, updated_at = datetime('now')
          WHERE company_id = ? AND original_invoice_id = ?
          RETURNING next_num - 1 AS n`,
    args: [companyId, originalInvoiceId],
  });

  const n = Number(result.rows[0]?.n ?? 0);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("فشل تخصيص رقم فاتورة المرتجع");
  }

  return `RET-${originalInvoiceNumber}-${n}`;
}

/**
 * بعد استيراد نسخة احتياطية أو دمج بيانات، يُحدَّث التسلسل من أرقام الفواتير الفعلية
 * حتى لا يتكرر رقم جديد مع أرقام مستوردة.
 */
export async function syncInvoiceNumberSequencesFromInvoices(companyId: string): Promise<void> {
  const saleR = await db.execute({
    sql: `SELECT COALESCE(MAX(
      CASE
        WHEN invoice_number LIKE 'INV-%' AND length(invoice_number) > 4
        THEN CAST(SUBSTR(invoice_number, 5) AS INTEGER)
        ELSE 0
      END
    ), 0) + 1 AS n FROM invoices WHERE company_id = ?`,
    args: [companyId],
  });
  const saleNext = Math.max(1, Number(saleR.rows[0]?.n ?? 1));

  const purR = await db.execute({
    sql: `SELECT COALESCE(MAX(
      CASE
        WHEN invoice_number LIKE 'PUR-%' AND length(invoice_number) > 4
        THEN CAST(SUBSTR(invoice_number, 5) AS INTEGER)
        ELSE 0
      END
    ), 0) + 1 AS n FROM invoices WHERE company_id = ?`,
    args: [companyId],
  });
  const purNext = Math.max(1, Number(purR.rows[0]?.n ?? 1));

  await db.execute({
    sql: `INSERT INTO invoice_number_sequences (company_id, seq_type, next_num, updated_at)
          VALUES (?, 'sale', ?, datetime('now'))
          ON CONFLICT(company_id, seq_type) DO UPDATE SET
            next_num = excluded.next_num,
            updated_at = datetime('now')`,
    args: [companyId, saleNext],
  });
  await db.execute({
    sql: `INSERT INTO invoice_number_sequences (company_id, seq_type, next_num, updated_at)
          VALUES (?, 'purchase', ?, datetime('now'))
          ON CONFLICT(company_id, seq_type) DO UPDATE SET
            next_num = excluded.next_num,
            updated_at = datetime('now')`,
    args: [companyId, purNext],
  });

  await db.execute({
    sql: `DELETE FROM invoice_return_sequences WHERE company_id = ?`,
    args: [companyId],
  });
  await db.execute({
    sql: `INSERT INTO invoice_return_sequences (company_id, original_invoice_id, next_num, updated_at)
          SELECT company_id, original_invoice_id, COUNT(*) + 1, datetime('now')
          FROM invoices
          WHERE company_id = ? AND is_return = 1 AND original_invoice_id IS NOT NULL
          GROUP BY company_id, original_invoice_id`,
    args: [companyId],
  });
}
