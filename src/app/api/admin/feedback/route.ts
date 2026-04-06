import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await db.execute({
      sql: `SELECT f.id, f.type, f.title, f.message, f.status, f.created_at,
                   f.screenshot_url, f.page_path, f.admin_reply, f.admin_replied_at,
                   u.name as user_name, u.email as user_email,
                   c.name as company_name
            FROM user_feedback f
            JOIN users u ON u.id = f.user_id
            JOIN companies c ON c.id = f.company_id
            ORDER BY f.created_at DESC`,
    });

    const items = result.rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      screenshot_url: r.screenshot_url ? String(r.screenshot_url) : null,
      page_path: r.page_path ? String(r.page_path) : null,
      admin_reply: r.admin_reply ? String(r.admin_reply) : null,
      admin_replied_at: r.admin_replied_at ? String(r.admin_replied_at) : null,
      user_name: r.user_name,
      user_email: r.user_email,
      company_name: r.company_name,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("Feedback GET error:", error);
    return NextResponse.json({ error: "فشل في جلب الملاحظات" }, { status: 500 });
  }
}
