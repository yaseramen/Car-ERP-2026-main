/**
 * Seed Script - إضافة Super Admin واختيارياً مالك تجريبي
 * Run: SEED_SUPER_ADMIN_PASSWORD=yourpassword npm run db:seed
 * Demo tenant: SEED_SUPER_ADMIN_PASSWORD=x SEED_DEMO_PASSWORD=Demo123! npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "../src/lib/db/client";

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "santws1@gmail.com";
const SEED_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD;
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const SYSTEM_COMPANY_ID = "company-system";

async function seed() {
  if (!SEED_PASSWORD) {
    console.error("❌ يجب تعيين SEED_SUPER_ADMIN_PASSWORD في البيئة");
    console.log("مثال: SEED_SUPER_ADMIN_PASSWORD=YourSecurePass123 npm run db:seed");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const userId = randomUUID();

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [SUPER_ADMIN_EMAIL],
  });

  if (existing.rows.length > 0) {
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE email = ?",
      args: [passwordHash, SUPER_ADMIN_EMAIL],
    });
    console.log("✅ تم تحديث كلمة مرور Super Admin:", SUPER_ADMIN_EMAIL);
  } else {
    await db.execute({
      sql: `INSERT INTO users (id, company_id, email, password_hash, name, role, is_active)
            VALUES (?, NULL, ?, ?, 'Super Admin', 'super_admin', 1)`,
      args: [userId, SUPER_ADMIN_EMAIL, passwordHash],
    });
    console.log("✅ تم إنشاء Super Admin:", SUPER_ADMIN_EMAIL);
  }

  if (DEMO_PASSWORD) {
    const demoEmail = "demo@alameen.com";
    const demoHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    const demoId = randomUUID();
    const demoExisting = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [demoEmail] });
    if (demoExisting.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO users (id, company_id, email, password_hash, name, role, is_active)
              VALUES (?, ?, ?, ?, 'مالك تجريبي', 'tenant_owner', 1)`,
        args: [demoId, SYSTEM_COMPANY_ID, demoEmail, demoHash],
      });
      console.log("✅ تم إنشاء مالك تجريبي:", demoEmail);
    }
  }

  console.log("يمكنك الآن تسجيل الدخول باستخدام البريد وكلمة المرور المحددة.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
