import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import bcrypt from "bcryptjs";
import { verifyTenantResetCode } from "@/lib/tenant-reset-code";

export async function POST(request: Request) {
  let body: { email?: string; code?: string; new_password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const email = String(body.email ?? "")
    .toLowerCase()
    .trim();
  const code = String(body.code ?? "").trim().replace(/\s+/g, "");
  const newPassword = String(body.new_password ?? "");

  if (!email || !code) {
    return NextResponse.json({ error: "البريد والكود مطلوبان" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
  }

  try {
    const userResult = await db.execute({
      sql: "SELECT id, company_id, role FROM users WHERE email = ? AND role = 'tenant_owner'",
      args: [email],
    });
    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "البريد غير مسجل كمالك شركة" }, { status: 400 });
    }

    const userId = String(userResult.rows[0].id);
    const companyId = userResult.rows[0].company_id ? String(userResult.rows[0].company_id) : null;
    if (!companyId) {
      return NextResponse.json({ error: "حساب غير مرتبط بشركة" }, { status: 400 });
    }

    const codeRow = await db.execute({
      sql: `SELECT id, code_hash, expires_at FROM tenant_password_reset_codes
            WHERE user_id = ? AND used_at IS NULL
            ORDER BY created_at DESC LIMIT 1`,
      args: [userId],
    });
    if (codeRow.rows.length === 0) {
      return NextResponse.json({ error: "لا يوجد كود صالح. اطلب كوداً جديداً من الإدارة." }, { status: 400 });
    }

    const row = codeRow.rows[0];
    const expiresAt = String(row.expires_at ?? "");
    if (new Date(expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "انتهت صلاحية الكود. اطلب كوداً جديداً." }, { status: 400 });
    }

    const ok = await verifyTenantResetCode(code, String(row.code_hash));
    if (!ok) {
      return NextResponse.json({ error: "الكود غير صحيح" }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
      args: [hash, userId],
    });
    await db.execute({
      sql: "UPDATE tenant_password_reset_codes SET used_at = datetime('now') WHERE id = ?",
      args: [String(row.id)],
    });

    return NextResponse.json({ success: true, message: "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن." });
  } catch (e) {
    console.error("reset-password-tenant:", e);
    return NextResponse.json({ error: "فشل تغيير كلمة المرور" }, { status: 500 });
  }
}
