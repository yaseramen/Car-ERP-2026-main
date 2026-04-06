import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const status = body.status != null && ["pending", "read", "resolved"].includes(body.status) ? body.status : null;
    const adminReply =
      typeof body.admin_reply === "string" ? body.admin_reply.trim().slice(0, 4000) : undefined;

    if (status == null && adminReply === undefined) {
      return NextResponse.json({ error: "أرسل حالة أو نص رد" }, { status: 400 });
    }

    if (adminReply !== undefined && adminReply.length > 0) {
      const newStatus = status ?? "read";
      await db.execute({
        sql: `UPDATE user_feedback SET
                status = ?,
                admin_reply = ?,
                admin_replied_at = datetime('now'),
                admin_replied_by = ?,
                user_reply_seen = 0,
                updated_at = datetime('now')
              WHERE id = ?`,
        args: [newStatus, adminReply, session.user.id, id],
      });
    } else if (status != null) {
      await db.execute({
        sql: "UPDATE user_feedback SET status = ?, updated_at = datetime('now') WHERE id = ?",
        args: [status, id],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback PATCH error:", error);
    return NextResponse.json({ error: "فشل في التحديث" }, { status: 500 });
  }
}
