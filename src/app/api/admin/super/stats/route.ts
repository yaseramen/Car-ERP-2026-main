import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

const EXCLUDED_IDS = ["company-system", "company-demo"];
const TARGET = 100;
const WARN_AT = 80;
const ALERT_AT = 90;

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const placeholders = EXCLUDED_IDS.map(() => "?").join(", ");
    const args = [...EXCLUDED_IDS];

    const totalRes = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM companies WHERE id NOT IN (${placeholders})`,
      args,
    });
    const totalCompanies = Number(totalRes.rows[0]?.cnt ?? 0);

    const activeRes = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM companies WHERE id NOT IN (${placeholders}) AND is_active = 1`,
      args,
    });
    const activeCompanies = Number(activeRes.rows[0]?.cnt ?? 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth.toISOString().slice(0, 19).replace("T", " ");

    const newRes = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM companies WHERE id NOT IN (${placeholders}) AND created_at >= ?`,
      args: [...args, monthStart],
    });
    const newThisMonth = Number(newRes.rows[0]?.cnt ?? 0);

    let alertLevel: "none" | "warn" | "alert" | "target" = "none";
    if (activeCompanies >= TARGET) alertLevel = "target";
    else if (activeCompanies >= ALERT_AT) alertLevel = "alert";
    else if (activeCompanies >= WARN_AT) alertLevel = "warn";

    return NextResponse.json({
      totalCompanies,
      activeCompanies,
      newThisMonth,
      target: TARGET,
      alertLevel,
    });
  } catch (error) {
    console.error("Super stats error:", error);
    return NextResponse.json({ error: "فشل في جلب الإحصائيات" }, { status: 500 });
  }
}
