import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

/** ملاحظات المستخدم الحالي مع رد الإدارة إن وُجد */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  try {
    const res = await db.execute({
      sql: `SELECT id, type, title, message, status, created_at, screenshot_url, page_path,
                   admin_reply, admin_replied_at
            FROM user_feedback
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 30`,
      args: [session.user.id],
    });

    const items = res.rows.map((r) => ({
      id: String(r.id),
      type: String(r.type ?? ""),
      title: String(r.title ?? ""),
      message: String(r.message ?? ""),
      status: String(r.status ?? ""),
      created_at: String(r.created_at ?? ""),
      screenshot_url: r.screenshot_url ? String(r.screenshot_url) : null,
      page_path: r.page_path ? String(r.page_path) : null,
      admin_reply: r.admin_reply ? String(r.admin_reply) : null,
      admin_replied_at: r.admin_replied_at ? String(r.admin_replied_at) : null,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("feedback my GET", e);
    return NextResponse.json({ error: "فشل التحميل" }, { status: 500 });
  }
}
