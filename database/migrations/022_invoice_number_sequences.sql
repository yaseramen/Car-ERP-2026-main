-- تسلسل أرقام الفواتير ذري (تفادي التكرار عند الطلبات المتزامنة)
CREATE TABLE IF NOT EXISTS invoice_number_sequences (
    company_id TEXT NOT NULL,
    seq_type TEXT NOT NULL CHECK (seq_type IN ('sale', 'purchase')),
    next_num INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, seq_type),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoice_return_sequences (
    company_id TEXT NOT NULL,
    original_invoice_id TEXT NOT NULL,
    next_num INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, original_invoice_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- تهيئة من الفواتير الحالية (بيع/شراء) — MAX على اللاحقة الرقمية بعد INV-/PUR-
INSERT OR IGNORE INTO invoice_number_sequences (company_id, seq_type, next_num)
SELECT c.id, 'sale', COALESCE(
  (SELECT MAX(
    CASE
      WHEN i.invoice_number LIKE 'INV-%' AND length(i.invoice_number) > 4
      THEN CAST(SUBSTR(i.invoice_number, 5) AS INTEGER)
      ELSE 0
    END
  ) FROM invoices i WHERE i.company_id = c.id),
  0
) + 1
FROM companies c;

INSERT OR IGNORE INTO invoice_number_sequences (company_id, seq_type, next_num)
SELECT c.id, 'purchase', COALESCE(
  (SELECT MAX(
    CASE
      WHEN i.invoice_number LIKE 'PUR-%' AND length(i.invoice_number) > 4
      THEN CAST(SUBSTR(i.invoice_number, 5) AS INTEGER)
      ELSE 0
    END
  ) FROM invoices i WHERE i.company_id = c.id),
  0
) + 1
FROM companies c;

-- مرتجعات جزئية: الرقم التالي = عدد المرتجعات السابقة + 1
INSERT OR IGNORE INTO invoice_return_sequences (company_id, original_invoice_id, next_num)
SELECT company_id, original_invoice_id, COUNT(*) + 1
FROM invoices
WHERE is_return = 1 AND original_invoice_id IS NOT NULL
GROUP BY company_id, original_invoice_id;
