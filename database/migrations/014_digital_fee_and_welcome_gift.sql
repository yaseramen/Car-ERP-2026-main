-- إعدادات النظام (النسبة الافتراضية للخدمة الرقمية)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
('digital_service_rate', '0.0001'),
('digital_service_min_fee', '0.5');

-- نسبة مخصصة للشركة (إن وُجدت تُستخدم بدل الافتراضية)
ALTER TABLE companies ADD COLUMN digital_service_rate REAL;
ALTER TABLE companies ADD COLUMN digital_service_min_fee REAL;
