import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

const EXCLUDED_IDS = ["company-system", "company-demo"];
const INACTIVE_DAYS = 30;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(10, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const filter = searchParams.get("filter")?.trim() || "all"; // all | active | inactive

  try {
    const placeholders = EXCLUDED_IDS.map(() => "?").join(", ");
    const args = [...EXCLUDED_IDS];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace("T", " ");

    const baseWhere = `c.id NOT IN (${placeholders})`;
    const baseArgs = [...args];

    const listSql = `
      SELECT
        c.id,
        c.name,
        COALESCE(c.business_type, 'both') as business_type,
        c.created_at,
        (SELECT MAX(created_at) FROM invoices i WHERE i.company_id = c.id AND i.status NOT IN ('cancelled')) as last_invoice,
        (SELECT MAX(last_login_at) FROM users u WHERE u.company_id = c.id) as last_login,
        (SELECT COUNT(*) FROM invoices i WHERE i.company_id = c.id AND i.status NOT IN ('cancelled')) as invoice_count,
        (SELECT COUNT(*) FROM customers cust WHERE cust.company_id = c.id) as customer_count,
        (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.role IN ('tenant_owner','employee')) as user_count
      FROM companies c
      WHERE ${baseWhere} AND c.is_active = 1
    `;

    let extraWhere = "";
    const listArgs = [...baseArgs];
    if (filter === "active") {
      extraWhere = ` AND (
        (SELECT MAX(created_at) FROM invoices i WHERE i.company_id = c.id AND i.status NOT IN ('cancelled')) >= ?
        OR (SELECT MAX(last_login_at) FROM users u WHERE u.company_id = c.id) >= ?
      )`;
      listArgs.push(cutoffStr, cutoffStr);
    } else if (filter === "inactive") {
      extraWhere = ` AND (
        (SELECT MAX(created_at) FROM invoices i WHERE i.company_id = c.id AND i.status NOT IN ('cancelled')) < ?
        OR (SELECT MAX(created_at) FROM invoices i WHERE i.company_id = c.id AND i.status NOT IN ('cancelled')) IS NULL
      ) AND (
        (SELECT MAX(last_login_at) FROM users u WHERE u.company_id = c.id) < ?
        OR (SELECT MAX(last_login_at) FROM users u WHERE u.company_id = c.id) IS NULL
      ) AND c.created_at < ?`;
      listArgs.push(cutoffStr, cutoffStr, cutoffStr);
    }

    const countSql = `SELECT COUNT(*) as cnt FROM companies c WHERE ${baseWhere} AND c.is_active = 1${extraWhere}`;
    const countRes = await db.execute({ sql: countSql, args: listArgs });
    const total = Number(countRes.rows[0]?.cnt ?? 0);

    const fullSql = listSql + extraWhere + ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    const fullArgs = [...listArgs, limit, offset];

    const result = await db.execute({
      sql: fullSql,
      args: fullArgs,
    });

    const rows = result.rows.map((r) => {
      const lastInvoice = r.last_invoice ? String(r.last_invoice) : null;
      const lastLogin = r.last_login ? String(r.last_login) : null;
      const lastActivity = [lastInvoice, lastLogin].filter(Boolean).sort().pop() || null;
      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
        : null;
      const status: "active" | "inactive" =
        lastActivity && daysSinceActivity !== null && daysSinceActivity <= INACTIVE_DAYS ? "active" : "inactive";

      return {
        id: r.id,
        name: r.name,
        business_type: String(r.business_type ?? "both"),
        created_at: r.created_at,
        last_activity: lastActivity,
        days_since_activity: daysSinceActivity,
        status,
        invoice_count: Number(r.invoice_count ?? 0),
        customer_count: Number(r.customer_count ?? 0),
        user_count: Number(r.user_count ?? 0),
      };
    });

    return NextResponse.json({
      rows,
      total,
      filter,
      inactiveThresholdDays: INACTIVE_DAYS,
    });
  } catch (error) {
    console.error("Companies usage error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
