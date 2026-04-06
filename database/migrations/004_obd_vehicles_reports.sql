-- OBD: ماركات المركبات ونماذجها وتقارير الفحص
-- Vehicle brands, models, and scan reports

CREATE TABLE IF NOT EXISTS vehicle_brands (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_models (
    id TEXT PRIMARY KEY,
    brand_id TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    name_en TEXT,
    year_from INTEGER,
    year_to INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (brand_id) REFERENCES vehicle_brands(id) ON DELETE CASCADE
);

-- تقارير الفحص المرفوعة (للتخزين والربط بالمركبة)
CREATE TABLE IF NOT EXISTS obd_reports (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    vehicle_brand TEXT,
    vehicle_model TEXT,
    vehicle_year INTEGER,
    vehicle_vin TEXT,
    codes_extracted TEXT NOT NULL,
    codes_count INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- توسيع obd_codes: ربط اختياري بالماركة/النموذج للسجلات الخاصة بالمصنّع
-- SQLite: ADD COLUMN one at a time, no IF NOT EXISTS
ALTER TABLE obd_codes ADD COLUMN vehicle_brand_id TEXT;
ALTER TABLE obd_codes ADD COLUMN vehicle_model_id TEXT;
ALTER TABLE obd_codes ADD COLUMN year_from INTEGER;
ALTER TABLE obd_codes ADD COLUMN year_to INTEGER;

CREATE INDEX IF NOT EXISTS idx_vehicle_models_brand ON vehicle_models(brand_id);
CREATE INDEX IF NOT EXISTS idx_obd_reports_company ON obd_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_obd_reports_created ON obd_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_obd_codes_vehicle_brand ON obd_codes(vehicle_brand_id);
