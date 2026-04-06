-- إضافة خزينة رئيسية: تعديل نوع الخزينة ليدعم 'main'
-- SQLite لا يدعم ALTER CHECK، لذا نعيد إنشاء الجدول

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS treasuries_new (
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

INSERT INTO treasuries_new SELECT * FROM treasuries;

DROP TABLE treasuries;

ALTER TABLE treasuries_new RENAME TO treasuries;

-- التأكد من وجود الشركة النظامية
INSERT OR IGNORE INTO companies (id, name, is_active) VALUES ('company-system', 'نظام EFCT', 1);

-- إنشاء الخزينة الرئيسية
INSERT OR IGNORE INTO treasuries (id, company_id, name, type, balance) 
VALUES ('treasury-main', 'company-system', 'الخزينة الرئيسية', 'main', 0);

PRAGMA foreign_keys = ON;
