-- خصم وضريبة مرنة لكل قطعة وخدمة في أمر الإصلاح
-- discount_type: 'percent' | 'amount' | NULL
-- discount_value: النسبة أو المبلغ
-- tax_percent: نسبة الضريبة أو NULL

ALTER TABLE repair_order_items ADD COLUMN discount_type TEXT;
ALTER TABLE repair_order_items ADD COLUMN discount_value REAL DEFAULT 0;
ALTER TABLE repair_order_items ADD COLUMN tax_percent REAL;

ALTER TABLE repair_order_services ADD COLUMN discount_type TEXT;
ALTER TABLE repair_order_services ADD COLUMN discount_value REAL DEFAULT 0;
ALTER TABLE repair_order_services ADD COLUMN tax_percent REAL;
