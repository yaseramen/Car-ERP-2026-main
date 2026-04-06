-- إضافة نوع أمر الإصلاح: صيانة | فحص قبل البيع/الشراء
ALTER TABLE repair_orders ADD COLUMN order_type TEXT DEFAULT 'maintenance';

-- جدول بنود قائمة الفحص (افتراضية لكل الشركات)
CREATE TABLE IF NOT EXISTS inspection_checklist_items (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    name_ar TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- نتائج الفحص لكل أمر
CREATE TABLE IF NOT EXISTS inspection_results (
    id TEXT PRIMARY KEY,
    repair_order_id TEXT NOT NULL,
    checklist_item_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ok', 'defect', 'needs_repair', 'na')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(repair_order_id, checklist_item_id),
    FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (checklist_item_id) REFERENCES inspection_checklist_items(id) ON DELETE CASCADE
);

-- بنود الفحص الافتراضية
INSERT OR IGNORE INTO inspection_checklist_items (id, company_id, name_ar, sort_order) VALUES
('ici-engine', NULL, 'المحرك', 1),
('ici-gearbox', NULL, 'ناقل الحركة', 2),
('ici-brakes', NULL, 'الفرامل', 3),
('ici-suspension', NULL, 'التعليق', 4),
('ici-body', NULL, 'الهيكل والصدأ', 5),
('ici-tires', NULL, 'الإطارات', 6),
('ici-electrical', NULL, 'الكهرباء', 7),
('ici-ac', NULL, 'التكييف', 8),
('ici-interior', NULL, 'الواجهة الداخلية', 9),
('ici-exterior', NULL, 'الطلاء والخدوش', 10);
