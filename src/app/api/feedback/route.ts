import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
    }

    const companyId = getCompanyId(session);
    if (!companyId) {
      return NextResponse.json({ error: "لا يمكن تحديد الشركة. أعد تسجيل الدخول أو تواصل مع المسؤول." }, { status: 400 });
    }

    const body = await req.json();
    const { type, subject, message, screenshot_url, page_path } = body as {
      type?: string;
      subject?: string;
      message?: string;
      screenshot_url?: string | null;
      page_path?: string | null;
    };

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "الموضوع والملاحظة مطلوبان" }, { status: 400 });
    }

    const rawType = String(type || "other").trim();
    const mappedType =
      rawType === "bug" ? "bug" : rawType === "suggestion" ? "feature" : "feedback";

    const shot =
      typeof screenshot_url === "string" && screenshot_url.startsWith("http") ? screenshot_url.slice(0, 2000) : null;
    const pathStr =
      typeof page_path === "string" ? page_path.trim().slice(0, 500) : null;

    const id = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO user_feedback (id, user_id, company_id, type, title, message, status, created_at, updated_at,
            screenshot_url, page_path, user_reply_seen)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'), ?, ?, 1)`,
      args: [
        id,
        session.user.id,
        companyId,
        mappedType,
        String(subject).trim().slice(0, 200),
        String(message).trim().slice(0, 2000),
        shot,
        pathStr || null,
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Feedback API error:", e);
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 });
  }
}
