-- باقات إعلان السوق + الإعلانات

CREATE TABLE IF NOT EXISTS marketplace_ad_packages (
    id TEXT PRIMARY KEY,
    label_ar TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    price REAL NOT NULL,
    category_scope TEXT NOT NULL DEFAULT 'both' CHECK(category_scope IN ('parts', 'workshop', 'both')),
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    item_id TEXT,
    category TEXT NOT NULL CHECK(category IN ('parts', 'workshop')),
    package_id TEXT NOT NULL,
    title_ar TEXT NOT NULL,
    description_ar TEXT,
    list_price REAL,
    contact_phone TEXT NOT NULL,
    contact_whatsapp TEXT,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'expired', 'cancelled')),
    starts_at TEXT,
    ends_at TEXT,
    auto_renew INTEGER DEFAULT 0,
    last_reminder_at TEXT,
    wallet_tx_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    cancelled_at TEXT,
    cancelled_by TEXT,
    cancel_reason TEXT,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
    FOREIGN KEY (package_id) REFERENCES marketplace_ad_packages(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (cancelled_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_company ON marketplace_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status_ends ON marketplace_listings(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON marketplace_listings(category);

-- باقات افتراضية (جنيه مصري — تعديل من لوحة السوبر أدمن لاحقاً عبر API)
INSERT OR IGNORE INTO marketplace_ad_packages (id, label_ar, duration_days, price, category_scope, sort_order, is_active) VALUES
('pkg-week-parts', 'عرض أسبوع — قطع غيار', 7, 50, 'parts', 10, 1),
('pkg-month-parts', 'عرض شهر — قطع غيار', 30, 150, 'parts', 20, 1),
('pkg-quarter-parts', 'عرض 3 أشهر — قطع غيار', 90, 400, 'parts', 30, 1),
('pkg-week-workshop', 'عرض أسبوع — معدات ورشة', 7, 50, 'workshop', 40, 1),
('pkg-month-workshop', 'عرض شهر — معدات ورشة', 30, 150, 'workshop', 50, 1),
('pkg-quarter-workshop', 'عرض 3 أشهر — معدات ورشة', 90, 400, 'workshop', 60, 1);
