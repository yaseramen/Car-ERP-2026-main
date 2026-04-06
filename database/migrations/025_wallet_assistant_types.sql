-- توسيع أنواع معاملات المحفظة: مساعد الشركة + مساعد قاعدة أكواد OBD العامة

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS wallet_transactions_new (
    id TEXT PRIMARY KEY,
    wallet_id TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('credit', 'debit', 'digital_service', 'obd_search', 'assistant_company', 'assistant_obd_global')),
    description TEXT,
    reference_type TEXT,
    reference_id TEXT,
    performed_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (wallet_id) REFERENCES company_wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id)
);

INSERT INTO wallet_transactions_new
SELECT id, wallet_id, amount, type, description, reference_type, reference_id, performed_by, created_at
FROM wallet_transactions;

DROP TABLE wallet_transactions;
ALTER TABLE wallet_transactions_new RENAME TO wallet_transactions;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created ON wallet_transactions(created_at);

PRAGMA foreign_keys=ON;
