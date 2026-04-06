import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/**
 * تعديل يدوي للكمية (جرد) — معطّل.
 * الكمية تتغير فقط عبر: فاتورة بيع، فاتورة شراء، أو مرتجع.
 */
export async function POST() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "التعديل اليدوي للمخزون معطّل. الكمية تتغير فقط عبر فاتورة بيع أو شراء أو مرتجع." },
    { status: 403 }
  );
}
