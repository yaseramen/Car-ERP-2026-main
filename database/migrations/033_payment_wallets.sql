-- محافظ استلام (فودافون كاش / إنستاباي) مرتبطة برقم المحفظة «المحول إليه»
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

CREATE INDEX IF NOT EXISTS idx_payment_wallets_company ON payment_wallets(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_wallet_tx_wallet ON payment_wallet_transactions(payment_wallet_id);

ALTER TABLE invoice_payments ADD COLUMN reference_from TEXT;
ALTER TABLE invoice_payments ADD COLUMN reference_to TEXT;
ALTER TABLE invoice_payments ADD COLUMN payment_wallet_id TEXT REFERENCES payment_wallets(id);
