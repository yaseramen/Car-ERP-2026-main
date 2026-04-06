-- إضافة نوع النشاط للشركات: بيع فقط، خدمة فقط، أو الاثنين
ALTER TABLE companies ADD COLUMN business_type TEXT DEFAULT 'both';
