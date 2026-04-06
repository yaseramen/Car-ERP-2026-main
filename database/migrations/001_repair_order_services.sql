-- خدمات أمر الإصلاح (عمالة، فحص، إلخ)
CREATE TABLE IF NOT EXISTS repair_order_services (
    id TEXT PRIMARY KEY,
    repair_order_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_repair_order_services_order ON repair_order_services(repair_order_id);
