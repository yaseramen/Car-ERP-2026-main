import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

/** ردود الإدارة غير المطالعة من قبل المستخدم (لإشعار المتصفح) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  try {
    const res = await db.execute({
      sql: `SELECT COUNT(*) as c FROM user_feedback
            WHERE user_id = ?
              AND admin_reply IS NOT NULL AND TRIM(admin_reply) != ''
              AND COALESCE(user_reply_seen, 1) = 0`,
      args: [session.user.id],
    });
    const unreadReplyCount = Number(res.rows[0]?.c ?? 0);
    return NextResponse.json({ unreadReplyCount });
  } catch (e) {
    console.error("feedback user notify-summary", e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
