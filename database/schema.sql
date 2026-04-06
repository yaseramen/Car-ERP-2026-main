-- ============================================================
-- EFCT - Database Schema
-- Al-Ameen Car Services - Comprehensive Schema
-- Turso/LibSQL Compatible
-- ============================================================

-- ==================== 1. المستخدمون والصلاحيات ====================

-- الشركات (Tenants) - مراكز الخدمة
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    logo_url TEXT,
    tax_number TEXT,
    commercial_registration TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- المستخدمون
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK(role IN ('super_admin', 'tenant_owner', 'employee')),
    is_active INTEGER DEFAULT 1,
    is_blocked INTEGER DEFAULT 0,
    blocked_at TEXT,
    blocked_by TEXT,
    last_login_at TEXT,
    assigned_warehouse_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_by) REFERENCES users(id),
    FOREIGN KEY (assigned_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL
);

-- الشاشات/الوحدات في النظام
CREATE TABLE IF NOT EXISTS screens (
    id TEXT PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    module TEXT NOT NULL
);

INSERT OR IGNORE INTO screens (id, name_ar, name_en, module) VALUES
('screen-marketplace', 'السوق والإعلانات', 'Marketplace', 'marketplace');

-- مصفوفة الصلاحيات (لكل موظف لكل شاشة)
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

-- ==================== 2. النظام المالي والمحافظ ====================

-- محفظة الشركة
CREATE TABLE IF NOT EXISTS company_wallets (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL UNIQUE,
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'EGP',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- معاملات شحن المحفظة (بواسطة Super Admin)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('credit', 'debit', 'digital_service', 'obd_search', 'assistant_company', 'assistant_obd_global', 'marketplace_ad')),
    description TEXT,
    reference_type TEXT,
    reference_id TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (wallet_id) REFERENCES company_wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- طلبات شحن المحفظة بإيصال (اعتماد يدوي)
CREATE TABLE IF NOT EXISTS wallet_topup_requests (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    requested_amount REAL NOT NULL,
    receipt_blob_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    approved_amount REAL,
    admin_comment TEXT,
    reject_reason TEXT,
    wallet_transaction_id TEXT,
    processed_by TEXT,
    processed_at TEXT,
    tenant_ack_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id),
    FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_topup_company_status ON wallet_topup_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_status_created ON wallet_topup_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_company_created ON wallet_topup_requests(company_id, created_at);

-- باقات إعلان السوق
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

-- إعلانات السوق (عرض فقط — لا معاملات عبر المنصة)
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
    image_blob_url TEXT,
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

INSERT OR IGNORE INTO marketplace_ad_packages (id, label_ar, duration_days, price, category_scope, sort_order, is_active) VALUES
('pkg-week-parts', 'عرض أسبوع — قطع غيار', 7, 50, 'parts', 10, 1),
('pkg-month-parts', 'عرض شهر — قطع غيار', 30, 150, 'parts', 20, 1),
('pkg-quarter-parts', 'عرض 3 أشهر — قطع غيار', 90, 400, 'parts', 30, 1),
('pkg-week-workshop', 'عرض أسبوع — معدات ورشة', 7, 50, 'workshop', 40, 1),
('pkg-month-workshop', 'عرض شهر — معدات ورشة', 30, 150, 'workshop', 50, 1),
('pkg-quarter-workshop', 'عرض 3 أشهر — معدات ورشة', 90, 400, 'workshop', 60, 1);

-- الخزائن (مبيعات، ورشة، رئيسية)
CREATE TABLE IF NOT EXISTS treasuries (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('sales', 'workshop', 'main')),
    balance REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(company_id, type),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- خزائن موزّعين (نقد اليوم قبل التسليم للخزينة الرئيسية)
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

-- معاملات الخزائن
CREATE TABLE IF NOT EXISTS treasury_transactions (
    id TEXT PRIMARY KEY,
    treasury_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out', 'transfer')),
    description TEXT,
    item_name TEXT,
    reference_type TEXT,
    reference_id TEXT,
    payment_method_id TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (treasury_id) REFERENCES treasuries(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- ==================== 3. العملاء والموردين ====================

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_number TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_number TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ==================== 4. المخازن والأصناف ====================

-- المخازن (رئيسي، عربات توزيع)
CREATE TABLE IF NOT EXISTS warehouses (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('main', 'distribution')),
    location TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- صلاحيات المخازن (لموظفين محددين)
CREATE TABLE IF NOT EXISTS warehouse_permissions (
    id TEXT PRIMARY KEY,
    warehouse_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    can_read INTEGER DEFAULT 1,
    can_create INTEGER DEFAULT 0,
    can_update INTEGER DEFAULT 0,
    can_delete INTEGER DEFAULT 0,
    UNIQUE(warehouse_id, user_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- الأصناف
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT,
    barcode TEXT,
    category TEXT,
    unit TEXT DEFAULT 'قطعة',
    purchase_price REAL DEFAULT 0,
    sale_price REAL DEFAULT 0,
    min_quantity REAL DEFAULT 0,
    has_expiry INTEGER DEFAULT 0,
    expiry_date TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- مخزون الصنف في كل مخزن
CREATE TABLE IF NOT EXISTS item_warehouse_stock (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    reserved_quantity REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(item_id, warehouse_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
);

-- حركة المخزون
CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('in', 'out', 'transfer', 'adjustment', 'workshop_install', 'return')),
    reference_type TEXT,
    reference_id TEXT,
    notes TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- ==================== 5. طرق الدفع ====================

CREATE TABLE IF NOT EXISTS payment_methods (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('cash', 'vodafone_cash', 'instapay', 'cheque', 'bank', 'credit')),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- محافظ استلام (رقم المحول إليه — محفظة إلكترونية / إنستاباي)
CREATE TABLE IF NOT EXISTS payment_wallets (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    payment_channel TEXT NOT NULL CHECK(payment_channel IN ('vodafone_cash', 'instapay')),
    phone_digits TEXT NOT NULL,
    name TEXT NOT NULL,
    balance REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(company_id, payment_channel, phone_digits),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_wallet_transactions (
    id TEXT PRIMARY KEY,
    payment_wallet_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    description TEXT,
    reference_type TEXT,
    reference_id TEXT,
    payment_method_id TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (payment_wallet_id) REFERENCES payment_wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

-- ==================== 6. الفواتير ====================

-- الفواتير (بيع، شراء، صيانة)
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('sale', 'purchase', 'maintenance')),
    status TEXT NOT NULL CHECK(status IN ('draft', 'pending', 'paid', 'partial', 'returned', 'cancelled')),
    customer_id TEXT,
    supplier_id TEXT,
    repair_order_id TEXT,
    warehouse_id TEXT,
    treasury_id TEXT,
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    digital_service_fee REAL DEFAULT 0,
    total REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    notes TEXT,
    is_return INTEGER DEFAULT 0,
    original_invoice_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(company_id, invoice_number),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (treasury_id) REFERENCES treasuries(id),
    FOREIGN KEY (original_invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- بنود الفاتورة
CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    item_id TEXT,
    description TEXT,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    discount REAL DEFAULT 0,
    total REAL NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- مدفوعات الفاتورة
CREATE TABLE IF NOT EXISTS invoice_payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method_id TEXT NOT NULL,
    treasury_id TEXT,
    reference_number TEXT,
    reference_from TEXT,
    reference_to TEXT,
    payment_wallet_id TEXT,
    notes TEXT,
    created_by TEXT NOT NULL,
    distribution_treasury_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id),
    FOREIGN KEY (treasury_id) REFERENCES treasuries(id),
    FOREIGN KEY (payment_wallet_id) REFERENCES payment_wallets(id),
    FOREIGN KEY (distribution_treasury_id) REFERENCES distribution_treasuries(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ==================== 7. ورشة العمل ====================

-- أوامر الإصلاح
CREATE TABLE IF NOT EXISTS repair_orders (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    customer_id TEXT,
    vehicle_plate TEXT,
    vehicle_model TEXT,
    vehicle_year INTEGER,
    mileage INTEGER,
    vin TEXT,
    stage TEXT NOT NULL CHECK(stage IN ('received', 'inspection', 'maintenance', 'ready', 'completed')),
    received_at TEXT,
    inspection_notes TEXT,
    estimated_completion TEXT,
    completed_at TEXT,
    invoice_id TEXT,
    warehouse_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(company_id, order_number),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- قطع تم تركيبها في الورشة (ترتبط بالمخزن والفاتورة)
CREATE TABLE IF NOT EXISTS repair_order_items (
    id TEXT PRIMARY KEY,
    repair_order_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    stock_movement_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (repair_order_id) REFERENCES repair_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (stock_movement_id) REFERENCES stock_movements(id)
);

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

-- ==================== 8. OBD والتشخيص الذكي ====================

-- أكواد OBD المخزنة
CREATE TABLE IF NOT EXISTS obd_codes (
    id TEXT PRIMARY KEY,
    company_id TEXT,
    code TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    causes TEXT,
    solutions TEXT,
    symptoms TEXT,
    source TEXT CHECK(source IN ('local', 'ai')),
    search_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

-- سجلات بحث OBD
CREATE TABLE IF NOT EXISTS obd_searches (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    code TEXT NOT NULL,
    obd_code_id TEXT,
    wallet_transaction_id TEXT,
    result_summary TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (obd_code_id) REFERENCES obd_codes(id),
    FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- أكواد استعادة كلمة مرور مالك الشركة (يُنشئها Super Admin)
CREATE TABLE IF NOT EXISTS tenant_password_reset_codes (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_by_super_admin_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_super_admin_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_reset_user ON tenant_password_reset_codes(user_id, used_at);
CREATE INDEX IF NOT EXISTS idx_tenant_reset_company ON tenant_password_reset_codes(company_id);

-- تسلسل أرقام الفواتير (ذري، آمن مع التزامن)
CREATE TABLE IF NOT EXISTS invoice_number_sequences (
    company_id TEXT NOT NULL,
    seq_type TEXT NOT NULL CHECK (seq_type IN ('sale', 'purchase')),
    next_num INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, seq_type),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoice_return_sequences (
    company_id TEXT NOT NULL,
    original_invoice_id TEXT NOT NULL,
    next_num INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (company_id, original_invoice_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- ==================== الفهارس ====================

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON wallet_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_treasuries_company ON treasuries(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_wallets_company ON payment_wallets(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_wallet_tx_wallet ON payment_wallet_transactions(payment_wallet_id);
CREATE INDEX IF NOT EXISTS idx_treasury_transactions_treasury ON treasury_transactions(treasury_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_company ON warehouses(company_id);
CREATE INDEX IF NOT EXISTS idx_items_company ON items(company_id);
CREATE INDEX IF NOT EXISTS idx_item_warehouse_stock_item ON item_warehouse_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_item_warehouse_stock_warehouse ON item_warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_company ON repair_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_repair_orders_stage ON repair_orders(stage);
CREATE INDEX IF NOT EXISTS idx_repair_orders_customer ON repair_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_obd_codes_code ON obd_codes(code);
CREATE INDEX IF NOT EXISTS idx_obd_searches_company ON obd_searches(company_id);

-- ==================== البيانات الأولية ====================
-- ملاحظة: الشاشات تُدرج من migration 006_screens_seed.sql لتجنب التكرار

-- طرق الدفع الافتراضية (عامة)
INSERT OR IGNORE INTO payment_methods (id, company_id, name, type) VALUES
    ('pm_cash', NULL, 'نقدي', 'cash'),
    ('pm_vodafone', NULL, 'محفظة إلكترونية', 'vodafone_cash'),
    ('pm_instapay', NULL, 'انستا باي', 'instapay'),
    ('pm_cheque', NULL, 'شيك', 'cheque'),
    ('pm_bank', NULL, 'تحويل بنكي', 'bank'),
    ('pm_credit', NULL, 'آجل', 'credit');
