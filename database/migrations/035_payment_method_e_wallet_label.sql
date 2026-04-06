-- تسمية عامة لطرق المحفظة غير فودافون فقط
UPDATE payment_methods SET name = 'محفظة إلكترونية' WHERE id = 'pm_vodafone' AND type = 'vodafone_cash';
