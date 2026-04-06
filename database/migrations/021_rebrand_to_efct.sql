-- استبدال اسم الأمين بـ EFCT في بيانات النظام
UPDATE companies SET name = 'نظام EFCT' WHERE id = 'company-system';
UPDATE companies SET name = 'مركز EFCT التجريبي' WHERE id = 'company-demo';
