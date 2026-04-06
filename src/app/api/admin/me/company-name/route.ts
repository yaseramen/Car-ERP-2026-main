import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/** جلب اسم الشركة الحالية (محدّث من قاعدة البيانات) */
export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ name: null });
  }

  try {
    const result = await db.execute({
      sql: "SELECT name FROM companies WHERE id = ?",
      args: [companyId],
    });
    const name = result.rows[0]?.name ? String(result.rows[0].name) : null;
    return NextResponse.json({ name });
  } catch {
    return NextResponse.json({ name: null });
  }
}
