import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }
  const role = session.user.role ?? "";
  if (role !== "super_admin" && role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح — متاح لسوبر الإدارة ومالك الشركة فقط" }, { status: 403 });
  }

  let body: { current_password?: string; new_password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const current = String(body.current_password ?? "");
  const newPass = String(body.new_password ?? "");

  if (!current || !newPass) {
    return NextResponse.json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" }, { status: 400 });
  }
  if (newPass.length < 6) {
    return NextResponse.json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
  }
  if (current === newPass) {
    return NextResponse.json({ error: "كلمة المرور الجديدة يجب أن تختلف عن الحالية" }, { status: 400 });
  }

  try {
    const r = await db.execute({
      sql: "SELECT id, password_hash FROM users WHERE id = ?",
      args: [session.user.id],
    });
    if (r.rows.length === 0) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    const ok = await bcrypt.compare(current, String(r.rows[0].password_hash ?? ""));
    if (!ok) {
      return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPass, 12);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
      args: [hash, session.user.id],
    });

    return NextResponse.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (e) {
    console.error("change-password:", e);
    return NextResponse.json({ error: "فشل تغيير كلمة المرور" }, { status: 500 });
  }
}
