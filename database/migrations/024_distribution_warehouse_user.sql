-- موزّع: مخزن فرعي/سيارة مسندة لموظف + خزينة يومية منفصلة

-- خزينة يومية لكل موزّع (نقد اليوم → تسليم للخزينة الرئيسية)
CREATE TABLE IF NOT EXISTS distribution_treasuries (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    warehouse_id TEXT NOT NULL,
    balance REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dist_treasuries_company ON distribution_treasuries(company_id);
CREATE INDEX IF NOT EXISTS idx_dist_treasuries_wh ON distribution_treasuries(warehouse_id);

CREATE TABLE IF NOT EXISTS distribution_treasury_transactions (
    id TEXT PRIMARY KEY,
    distribution_treasury_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out', 'transfer')),
    description TEXT,
    reference_type TEXT,
    reference_id TEXT,
    payment_method_id TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (distribution_treasury_id) REFERENCES distribution_treasuries(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_dist_treasury_tx_treasury ON distribution_treasury_transactions(distribution_treasury_id);

-- مخزن التوزيع المسند للموظف (سيارة/فرع)
ALTER TABLE users ADD COLUMN assigned_warehouse_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_assigned_wh ON users(assigned_warehouse_id);

-- مدفوعات فاتورة البيع: إما خزينة المبيعات أو خزينة الموزّع
ALTER TABLE invoice_payments ADD COLUMN distribution_treasury_id TEXT;
