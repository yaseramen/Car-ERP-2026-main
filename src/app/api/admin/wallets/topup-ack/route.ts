import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

/** مالك الشركة: تأكيد الاطلاع على نتيجة الطلب (إيقاف إشعار «جديد») */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) {
    return NextResponse.json({ error: "لا توجد شركة مرتبطة" }, { status: 400 });
  }

  let body: { request_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح" }, { status: 400 });
  }

  const rid = typeof body.request_id === "string" ? body.request_id.trim() : "";
  if (!rid) {
    return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
  }

  try {
    const r = await db.execute({
      sql: `UPDATE wallet_topup_requests SET tenant_ack_at = datetime('now')
            WHERE id = ? AND company_id = ? AND status IN ('approved', 'rejected') AND tenant_ack_at IS NULL`,
      args: [rid, companyId],
    });
    const n = "rowsAffected" in r ? (r as { rowsAffected: number }).rowsAffected : 0;
    if (n === 0) {
      const check = await db.execute({
        sql: "SELECT id, status, tenant_ack_at FROM wallet_topup_requests WHERE id = ? AND company_id = ?",
        args: [rid, companyId],
      });
      if (check.rows.length === 0) {
        return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("topup-ack:", e);
    return NextResponse.json({ error: "فشل التحديث" }, { status: 500 });
  }
}
