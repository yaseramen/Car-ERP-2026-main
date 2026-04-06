import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { packageMatchesCategory, type MarketplaceCategory } from "@/lib/marketplace";

/** باقات متاحة لإنشاء إعلان (حسب قسم العرض) */
export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (session.user.companyBusinessType !== "supplier") {
    return NextResponse.json({ packages: [] });
  }
  if (session.user.role === "employee") {
    const ok = await canAccess(session.user.id, "employee", companyId, "marketplace", "read");
    if (!ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("category")?.trim() as MarketplaceCategory | null;
  if (cat && cat !== "parts" && cat !== "workshop") {
    return NextResponse.json({ error: "category غير صالح" }, { status: 400 });
  }

  try {
    const res = await db.execute({
      sql: `SELECT id, label_ar, duration_days, price, category_scope, sort_order
            FROM marketplace_ad_packages WHERE is_active = 1 ORDER BY sort_order ASC, duration_days ASC`,
    });
    let rows = res.rows.map((r) => ({
      id: String(r.id),
      label_ar: String(r.label_ar),
      duration_days: Number(r.duration_days),
      price: Number(r.price),
      category_scope: String(r.category_scope ?? "both"),
      sort_order: Number(r.sort_order ?? 0),
    }));
    if (cat) {
      rows = rows.filter((p) => packageMatchesCategory(p.category_scope, cat));
    }
    return NextResponse.json({ packages: rows });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل جلب الباقات" }, { status: 500 });
  }
}
