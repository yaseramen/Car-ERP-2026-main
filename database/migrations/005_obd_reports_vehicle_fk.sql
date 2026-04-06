-- ربط تقارير OBD بجداول الماركات والنماذج (للتوسع التلقائي)
ALTER TABLE obd_reports ADD COLUMN vehicle_brand_id TEXT;
ALTER TABLE obd_reports ADD COLUMN vehicle_model_id TEXT;
