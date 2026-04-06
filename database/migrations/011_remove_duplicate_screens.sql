-- إزالة الشاشات المكررة (من schema.sql القديم)
-- migration 006 تُدرج الشاشات الصحيحة، لكن schema كان يُدرج نسخاً بأسماء عربية متطابقة

-- حذف صلاحيات المستخدمين المرتبطة بالشاشات المكررة
DELETE FROM user_permissions WHERE screen_id IN (
  'screen_warehouse', 'screen_workshop', 'screen_cashier',
  'screen_reports', 'screen_settings', 'screen_wallet'
);

-- حذف الشاشات المكررة
DELETE FROM screens WHERE id IN (
  'screen_warehouse', 'screen_workshop', 'screen_cashier',
  'screen_reports', 'screen_settings', 'screen_wallet'
);
