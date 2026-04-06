-- طلبات شحن المحفظة بإيصال (اعتماد يدوي من Super Admin)
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
