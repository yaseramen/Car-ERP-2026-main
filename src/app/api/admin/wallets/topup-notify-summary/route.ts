import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

/** لمالك الشركة: طلبات منفَّذة بلا تأكيد اطلاع — للإشعار */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) {
    return NextResponse.json({ unackedCount: 0, items: [] });
  }

  try {
    const r = await db.execute({
      sql: `SELECT id, status, approved_amount, reject_reason, processed_at
            FROM wallet_topup_requests
            WHERE company_id = ? AND status IN ('approved', 'rejected') AND tenant_ack_at IS NULL
            ORDER BY datetime(COALESCE(processed_at, created_at)) DESC
            LIMIT 20`,
      args: [companyId],
    });
    const items = r.rows.map((row) => ({
      id: String(row.id ?? ""),
      status: String(row.status ?? ""),
      approved_amount: row.approved_amount != null ? Number(row.approved_amount) : null,
      reject_reason: row.reject_reason != null ? String(row.reject_reason) : null,
      processed_at: row.processed_at != null ? String(row.processed_at) : null,
    }));
    return NextResponse.json({ unackedCount: items.length, items });
  } catch (e) {
    console.error("topup-notify-summary owner:", e);
    return NextResponse.json({ unackedCount: 0, items: [] });
  }
}
