# EFCT

منصة SaaS متكاملة لإدارة مراكز خدمة السيارات - مبنية بـ Next.js 15 و Turso و Tailwind CSS.

## البنية التقنية

- **Framework:** Next.js 15
- **Database:** Turso (LibSQL)
- **Styling:** Tailwind CSS
- **Language:** TypeScript

## هيكل المشروع

```
├── database/
│   ├── schema.sql          # مخطط قاعدة البيانات الشامل
│   └── SCHEMA_DIAGRAM.md   # توضيح العلاقات بين الجداول
├── scripts/
│   └── migrate.ts          # تشغيل migrations
├── src/
│   ├── app/
│   │   ├── (auth)/         # تسجيل الدخول
│   │   └── (dashboard)/    # لوحة التحكم
│   │       └── admin/      # لوحة التحكم (كل الأدوار تحت /admin)
│   ├── components/
│   ├── lib/
│   │   └── db/             # اتصال Turso
│   └── types/
└── .env                    # بيانات الاتصال (لا يُرفع)
```

## الإعداد

1. **نسخ ملف البيئة وتعبئته:**
   ```bash
   cp .env.example .env
   ```
   ثم عدّل `.env` بالقيم الفعلية. المتغيرات المطلوبة:

   | المتغير | مطلوب | الوصف |
   |---------|-------|-------|
   | `TURSO_DATABASE_URL` | ✅ | رابط قاعدة Turso (مثل `libsql://xxx.turso.io`) |
   | `TURSO_AUTH_TOKEN` | ✅ | رمز مصادقة Turso |
   | `AUTH_SECRET` أو `NEXTAUTH_SECRET` | ✅ | سري الجلسات (مثلاً: `openssl rand -base64 32`) |
   | `NEXTAUTH_URL` أو `NEXT_PUBLIC_APP_URL` | للإنتاج | رابط التطبيق (مثل `https://car.aiverce.com`) |

   **ملاحظة:** بدون `TURSO_DATABASE_URL` و `TURSO_AUTH_TOKEN` يفشل البناء والتشغيل.

2. **تشغيل Migrations:**
   ```bash
   npm run db:migrate
   ```
   **على Vercel:** لا حاجة لجهاز سطح مكتب — أمر `npm run build` يشغّل `db:migrate` تلقائياً باستخدام نفس `TURSO_DATABASE_URL` و`TURSO_AUTH_TOKEN` المضبوطين في المشروع. إن فشل الترحيل يفشل النشر وتجد التفاصيل في **Deployments → Build Logs**.

3. **إضافة Super Admin (اختياري):**
   ```bash
   SEED_SUPER_ADMIN_PASSWORD=كلمة_المرور_المرغوبة npm run db:seed
   ```

4. **تشغيل التطبيق:**
   ```bash
   npm run dev
   ```

**بيانات Super Admin الافتراضية:** santws1@gmail.com / `Admin@123`  
لتغيير كلمة المرور: `SEED_SUPER_ADMIN_PASSWORD=الجديدة npm run db:seed`

**متغيرات Vercel المطلوبة:** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `NEXTAUTH_URL`  
*(بدون TURSO_DATABASE_URL و TURSO_AUTH_TOKEN يفشل البناء)*

**لنطاق مخصص (مثل car.aiverce.com):** أضف `NEXT_PUBLIC_APP_URL=https://car.aiverce.com` في Vercel → Settings → Environment Variables → Production. هذا يمنع إعادة التوجيه إلى vercel.app ويُبقي تسجيل الدخول على نطاقك.

**للتحقق من الإعداد:** افتح `/api/health` - إذا ظهر `auth: "missing_secret"` أضف AUTH_SECRET في Vercel → Settings → Environment Variables → Production

## ملاحظات تقنية

- **Next.js 16 / middleware:** تظهر رسالة أن `middleware` أصبحت `proxy`. الحل المستقبلي: تشغيل `npx @next/codemod@canary middleware-to-proxy .` أو نقل منطق المصادقة إلى layout guards حسب توصيات Next.js 16.

## خارطة الطريق (ما بُني وما التالي)

راجع **`docs/PRODUCT_ROADMAP.md`** — ملخص تنفيذي لما تم منذ بداية المشروع وخطط التطوير المؤجلة (للمتابعة بين المحادثات).

## الميزات الرئيسية

- **مستخدمون وصلاحيات:** Super Admin، Tenant Owner، موظفون بصلاحيات دقيقة
- **مخازن متعددة:** رئيسي + عربات توزيع
- **فواتير:** بيع، شراء، صيانة مع طرق دفع متعددة
- **ورشة العمل:** استلام → فحص → صيانة → جاهزة → فاتورة
- **OBD:** تشخيص ذكي مع بحث محلي و AI
- **محفظة وخدمة رقمية:** خصم تلقائي من كل فاتورة
- **خزائن منفصلة:** صندوق البيع وصندوق الورشة
