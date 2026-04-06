import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import type { MarketplaceCategory } from "@/lib/marketplace";

function canAccessMarket(role: string | undefined): boolean {
  return role === "super_admin" || role === "tenant_owner" || role === "employee";
}

/** سوق B2B — قراءة فقط للمستخدمين المسجّلين؛ إعلانات نشطة فقط */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !canAccessMarket(session.user.role)) {
    return NextResponse.json({ error: "يجب تسجيل الدخول لعرض السوق" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const cat = searchParams.get("category")?.trim() as MarketplaceCategory | undefined;
  if (cat && cat !== "parts" && cat !== "workshop") {
    return NextResponse.json({ error: "category: parts أو workshop" }, { status: 400 });
  }

  try {
    let sql = `
      SELECT
        l.id,
        l.title_ar,
        l.description_ar,
        l.list_price,
        l.contact_phone,
        l.contact_whatsapp,
        l.image_url,
        l.category,
        l.ends_at,
        c.name as company_name
      FROM marketplace_listings l
      JOIN companies c ON c.id = l.company_id
      WHERE l.status = 'active'
        AND COALESCE(c.is_active, 1) = 1
        AND l.ends_at IS NOT NULL AND datetime(l.ends_at) > datetime('now')
        AND (
          (COALESCE(c.marketplace_enabled, 1) = 1 AND COALESCE(c.ads_globally_disabled, 0) = 0)
          OR l.wallet_tx_id IS NULL
        )
    `;
    const args: string[] = [];
    if (cat) {
      sql += " AND l.category = ?";
      args.push(cat);
    }
    sql += " ORDER BY l.ends_at DESC LIMIT 200";

    const res = await db.execute({ sql, args });

    const listings = res.rows.map((r) => ({
      id: r.id,
      title_ar: r.title_ar,
      description_ar: r.description_ar,
      list_price: r.list_price != null ? Number(r.list_price) : null,
      contact_phone: r.contact_phone,
      contact_whatsapp: r.contact_whatsapp,
      image_url: r.image_url,
      category: r.category,
      ends_at: r.ends_at,
      company_name: r.company_name,
    }));

    return NextResponse.json({ listings });
  } catch (e) {
    console.error("marketplace listings GET", e);
    return NextResponse.json({ error: "فشل تحميل السوق" }, { status: 500 });
  }
}
