import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

/** يستدعى عند فتح صفحة ملاحظات المطور — يوقف تكرار إشعار الرد */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  try {
    await db.execute({
      sql: `UPDATE user_feedback SET user_reply_seen = 1, updated_at = datetime('now')
            WHERE user_id = ?
              AND admin_reply IS NOT NULL AND TRIM(admin_reply) != ''`,
      args: [session.user.id],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("mark-replies-seen", e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
