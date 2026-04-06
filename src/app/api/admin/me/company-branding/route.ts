import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

/** شعار واسم الشركة للشريط الجانبي — لأي مستخدم مسجّل له شركة (بما فيها سوبر أدمن على company-system) */
export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) {
    return NextResponse.json({ name: null, logo_url: null });
  }

  try {
    const res = await db.execute({
      sql: "SELECT name, logo_url FROM companies WHERE id = ?",
      args: [companyId],
    });
    const row = res.rows[0];
    if (!row) {
      return NextResponse.json({ name: null, logo_url: null });
    }
    return NextResponse.json({
      name: row.name ? String(row.name) : null,
      logo_url: row.logo_url ? String(row.logo_url) : null,
    });
  } catch {
    return NextResponse.json({ error: "فشل التحميل" }, { status: 500 });
  }
}
