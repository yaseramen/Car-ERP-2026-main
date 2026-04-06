-- إضافة خانة اسم المصروف/الإيراد للمراجعة والتقارير
ALTER TABLE treasury_transactions ADD COLUMN item_name TEXT;

CREATE INDEX IF NOT EXISTS idx_treasury_transactions_item_name ON treasury_transactions(item_name);
