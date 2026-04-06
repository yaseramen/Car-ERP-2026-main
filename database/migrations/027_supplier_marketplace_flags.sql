-- نوع نشاط مورّد + أعلام السوق (للسوبر أدمن: تفعيل السوق لاحقاً، إيقاف الإعلانات عالمياً)
-- marketplace_enabled: 1 = يمكن للشركة استخدام ميزات السوق عند توفرها
-- ads_globally_disabled: 1 = إخفاء كل إعلانات الشركة من السوق (طوارئ/إدارة)

ALTER TABLE companies ADD COLUMN marketplace_enabled INTEGER DEFAULT 1;
ALTER TABLE companies ADD COLUMN ads_globally_disabled INTEGER DEFAULT 0;
