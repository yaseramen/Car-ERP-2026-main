import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

const EXCLUDED_COMPANIES = ["company-system", "company-demo"];

/**
 * إيرادات المنصة من محافظ العملاء: رسوم الخدمة الرقمية + OBD (مجموع المبالغ المخصومة)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();

  if (!from || !to) {
    return NextResponse.json({ error: "حدد تاريخ البداية والنهاية (from, to) بصيغة YYYY-MM-DD" }, { status: 400 });
  }

  const ph = EXCLUDED_COMPANIES.map(() => "?").join(", ");

  try {
    const totalRes = await db.execute({
      sql: `SELECT COALESCE(SUM(wt.amount), 0) as total
            FROM wallet_transactions wt
            JOIN company_wallets cw ON wt.wallet_id = cw.id
            WHERE wt.type IN ('digital_service', 'obd_search')
              AND cw.company_id NOT IN (${ph})
              AND date(wt.created_at) >= date(?)
              AND date(wt.created_at) <= date(?)`,
      args: [...EXCLUDED_COMPANIES, from, to],
    });
    const total = Number(totalRes.rows[0]?.total ?? 0);

    const byCompanyRes = await db.execute({
      sql: `SELECT c.id as company_id, c.name as company_name,
                   COALESCE(SUM(wt.amount), 0) as revenue
            FROM wallet_transactions wt
            JOIN company_wallets cw ON wt.wallet_id = cw.id
            JOIN companies c ON cw.company_id = c.id
            WHERE wt.type IN ('digital_service', 'obd_search')
              AND cw.company_id NOT IN (${ph})
              AND date(wt.created_at) >= date(?)
              AND date(wt.created_at) <= date(?)
            GROUP BY c.id, c.name
            HAVING revenue > 0
            ORDER BY revenue DESC`,
      args: [...EXCLUDED_COMPANIES, from, to],
    });

    const by_company = byCompanyRes.rows.map((r) => ({
      company_id: String(r.company_id),
      company_name: String(r.company_name ?? ""),
      revenue: Number(r.revenue ?? 0),
    }));

    const breakdownRes = await db.execute({
      sql: `SELECT wt.type, COALESCE(SUM(wt.amount), 0) as subtotal
            FROM wallet_transactions wt
            JOIN company_wallets cw ON wt.wallet_id = cw.id
            WHERE wt.type IN ('digital_service', 'obd_search')
              AND cw.company_id NOT IN (${ph})
              AND date(wt.created_at) >= date(?)
              AND date(wt.created_at) <= date(?)
            GROUP BY wt.type`,
      args: [...EXCLUDED_COMPANIES, from, to],
    });

    const breakdown: { digital_service: number; obd_search: number } = {
      digital_service: 0,
      obd_search: 0,
    };
    for (const row of breakdownRes.rows) {
      const t = String(row.type ?? "");
      const v = Number(row.subtotal ?? 0);
      if (t === "digital_service") breakdown.digital_service = v;
      if (t === "obd_search") breakdown.obd_search = v;
    }

    return NextResponse.json({
      from,
      to,
      total,
      by_company,
      breakdown,
      note:
        "يستثنى حساب النظام التجريبي (company-system) والعرض التوضيحي. المعاملات القديمة قبل التعديل قد تظهر في سجل المحفظة لكن لا تُحسب هنا إن وُجدت لشركة مستثناة.",
    });
  } catch (e) {
    console.error("platform-revenue error:", e);
    return NextResponse.json({ error: "فشل في جلب الإيرادات" }, { status: 500 });
  }
}
