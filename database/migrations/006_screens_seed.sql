-- توسيع جدول الشاشات وإضافة البيانات الأولية
-- نعيد إنشاء الجدول لدعم وحدات إضافية

CREATE TABLE IF NOT EXISTS screens_new (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    module TEXT NOT NULL
);

INSERT OR IGNORE INTO screens_new (id, name_ar, name_en, module) VALUES
('screen-dashboard', 'الرئيسية', 'Dashboard', 'dashboard'),
('screen-inventory', 'المخزن', 'Inventory', 'inventory'),
('screen-workshop', 'الورشة', 'Workshop', 'workshop'),
('screen-obd', 'OBD', 'OBD', 'obd'),
('screen-cashier', 'الكاشير', 'Cashier', 'cashier'),
('screen-purchases', 'فواتير الشراء', 'Purchases', 'purchases'),
('screen-invoices', 'الفواتير', 'Invoices', 'invoices'),
('screen-customers', 'العملاء', 'Customers', 'customers'),
('screen-suppliers', 'الموردون', 'Suppliers', 'suppliers'),
('screen-reports', 'التقارير', 'Reports', 'reports'),
('screen-treasuries', 'الخزائن', 'Treasuries', 'treasuries'),
('screen-wallets', 'المحافظ', 'Wallets', 'wallets'),
('screen-settings', 'الإعدادات', 'Settings', 'settings');

-- إذا كان جدول screens موجوداً بنفس الهيكل القديم، نحذفه ونستبدله
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS screens;

ALTER TABLE screens_new RENAME TO screens;

-- إعادة إنشاء user_permissions
CREATE TABLE IF NOT EXISTS user_permissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    screen_id TEXT NOT NULL,
    can_read INTEGER DEFAULT 0,
    can_create INTEGER DEFAULT 0,
    can_update INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, screen_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
