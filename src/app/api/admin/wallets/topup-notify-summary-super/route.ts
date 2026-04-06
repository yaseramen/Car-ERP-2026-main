import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

/** للسوبر أدمن: عدد طلبات الشحن المعلّقة */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const r = await db.execute({
      sql: "SELECT COUNT(*) as c FROM wallet_topup_requests WHERE status = 'pending'",
    });
    const pendingCount = Number(r.rows[0]?.c ?? 0);
    return NextResponse.json({ pendingCount: Number.isFinite(pendingCount) ? pendingCount : 0 });
  } catch (e) {
    console.error("topup-notify-summary-super:", e);
    return NextResponse.json({ pendingCount: 0 });
  }
}
