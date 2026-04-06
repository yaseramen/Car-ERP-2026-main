-- شركة تجريبية ومالك للاختبار (اختياري)
-- يمكن حذف هذا الملف أو تعديله حسب الحاجة

INSERT OR IGNORE INTO companies (id, name, phone, is_active) VALUES
('company-demo', 'مركز EFCT التجريبي', '01009376052', 1);

-- مالك تجريبي: demo@alameen.com / Demo123! (يُنشأ فقط إذا لم يكن موجوداً)
-- لإنشاء كلمة المرور: npm run db:seed مع SEED_DEMO_PASSWORD=Demo123!
