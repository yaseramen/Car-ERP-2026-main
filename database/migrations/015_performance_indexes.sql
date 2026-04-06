-- فهارس لتحسين أداء الاستعلامات مع البيانات الكبيرة
CREATE INDEX IF NOT EXISTS idx_invoices_company_created ON invoices(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_name ON suppliers(company_id, name);
CREATE INDEX IF NOT EXISTS idx_items_company_name ON items(company_id, name);
CREATE INDEX IF NOT EXISTS idx_items_company_created ON items(company_id, created_at DESC);
