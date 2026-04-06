/**
 * إعادة تعيين كلمة مرور حساب super_admin من سطر الأوامر (استعادة الطوارئ).
 * يتطلب وصولاً آمناً لقاعدة البيانات (متغيرات Turso في .env).
 *
 * الاستخدام من جذر المشروع:
 *   npx tsx scripts/reset-super-admin-password.ts admin@example.com NewSecurePass123
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
if (!tursoUrl || !tursoToken) {
  console.error("TURSO_DATABASE_URL و TURSO_AUTH_TOKEN مطلوبان في .env");
  process.exit(1);
}
const dbUrl = tursoUrl;
const dbToken = tursoToken;

const emailArg = process.argv[2]?.toLowerCase().trim();
const newPass = process.argv[3];
if (!emailArg || !newPass || newPass.length < 6) {
  console.error("الاستخدام: npx tsx scripts/reset-super-admin-password.ts <email> <new_password>");
  process.exit(1);
}

async function main() {
  const client = createClient({ url: dbUrl, authToken: dbToken });
  const r = await client.execute({
    sql: "SELECT id, email, name FROM users WHERE email = ? AND role = 'super_admin'",
    args: [emailArg],
  });
  if (r.rows.length === 0) {
    console.error("لا يوجد مستخدم super_admin بهذا البريد.");
    process.exit(1);
  }
  const id = String(r.rows[0].id ?? "");
  if (!id) {
    console.error("معرّف المستخدم غير صالح");
    process.exit(1);
  }
  const hash = await bcrypt.hash(newPass, 12);
  await client.execute({
    sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    args: [hash, id],
  });
  console.log(`تم تحديث كلمة المرور لـ ${r.rows[0].email} (${r.rows[0].name}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
