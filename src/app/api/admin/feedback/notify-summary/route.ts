import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

/** عدد الملاحظات المعلّقة — لإشعار Super Admin (مقارنة مع آخر قيمة محلياً) */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const res = await db.execute({
      sql: "SELECT COUNT(*) as c FROM user_feedback WHERE status = 'pending'",
      args: [],
    });
    const pendingCount = Number(res.rows[0]?.c ?? 0);
    return NextResponse.json({ pendingCount });
  } catch (e) {
    console.error("feedback notify-summary", e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
