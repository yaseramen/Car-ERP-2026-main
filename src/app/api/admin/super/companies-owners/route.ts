import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

const EXCLUDED = ["company-system", "company-demo"];

/** قائمة شركات + مالك (tenant_owner) لصفحة أكواد الاستعادة */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const ph = EXCLUDED.map(() => "?").join(", ");
    const companies = await db.execute({
      sql: `SELECT c.id, c.name,
            (SELECT u.id FROM users u WHERE u.company_id = c.id AND u.role = 'tenant_owner' LIMIT 1) as owner_id,
            (SELECT u.email FROM users u WHERE u.company_id = c.id AND u.role = 'tenant_owner' LIMIT 1) as owner_email,
            (SELECT u.name FROM users u WHERE u.company_id = c.id AND u.role = 'tenant_owner' LIMIT 1) as owner_name
            FROM companies c
            WHERE c.id NOT IN (${ph}) AND c.is_active = 1
            ORDER BY c.name`,
      args: EXCLUDED,
    });

    const rows = companies.rows.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      owner_id: r.owner_id ? String(r.owner_id) : null,
      owner_email: r.owner_email ? String(r.owner_email) : null,
      owner_name: r.owner_name ? String(r.owner_name) : null,
    }));

    return NextResponse.json({ companies: rows });
  } catch (e) {
    console.error("companies-owners:", e);
    return NextResponse.json({ error: "فشل تحميل الشركات" }, { status: 500 });
  }
}
