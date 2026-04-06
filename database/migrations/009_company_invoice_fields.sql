-- إضافة حقول بيانات الفاتورة للشركات: رقم البطاقة الضريبية، رقم السجل التجاري
ALTER TABLE companies ADD COLUMN tax_number TEXT;
ALTER TABLE companies ADD COLUMN commercial_registration TEXT;
