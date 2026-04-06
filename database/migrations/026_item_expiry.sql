-- صلاحية اختيارية على مستوى الصنف (تنبيه فقط — لا يمنع البيع)

ALTER TABLE items ADD COLUMN has_expiry INTEGER DEFAULT 0;
ALTER TABLE items ADD COLUMN expiry_date TEXT;

CREATE INDEX IF NOT EXISTS idx_items_company_expiry ON items(company_id, has_expiry, expiry_date);
