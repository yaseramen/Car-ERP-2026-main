-- إزالة فهارس فريدة كانت تسبب فشل النشر عند تكرار بيانات قديمة أو قيود Turso/LibSQL
-- منع التكرار يبقى في طبقة API (POST/PATCH/استيراد)

DROP INDEX IF EXISTS idx_items_company_code_unique;
DROP INDEX IF EXISTS idx_items_company_barcode_unique;
