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
