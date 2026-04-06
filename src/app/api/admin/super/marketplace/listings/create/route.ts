import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { packageMatchesCategory, type MarketplaceCategory } from "@/lib/marketplace";

/**
 * إعلان تجريبي / إداري: بدون خصم محفظة، بدون قيود marketplace_enabled / نوع مورّد.
 * للسوبر أدمن فقط — لاختبار صفحة /market.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      company_id,
      title_ar,
      description_ar,
      list_price,
      category,
      package_id,
      contact_phone,
      contact_whatsapp,
      image_url,
      image_blob_url,
    } = body;

    if (!company_id?.trim() || !title_ar?.trim() || !contact_phone?.trim() || !package_id) {
      return NextResponse.json({ error: "الشركة والعنوان والهاتف والباقة مطلوبة" }, { status: 400 });
    }
    const cat = category as MarketplaceCategory;
    if (cat !== "parts" && cat !== "workshop") {
      return NextResponse.json({ error: "قسم غير صالح" }, { status: 400 });
    }

    const co = await db.execute({
      sql: `SELECT id, COALESCE(business_type, 'both') as business_type
            FROM companies WHERE id = ? AND COALESCE(is_active,1) = 1`,
      args: [String(company_id).trim()],
    });
    if (co.rows.length === 0) {
      return NextResponse.json({ error: "الشركة غير موجودة أو معطّلة" }, { status: 400 });
    }
    const bt = String(co.rows[0].business_type ?? "both");
    if (bt !== "supplier" && bt !== "both") {
      return NextResponse.json(
        { error: "يُسمح بإعلان السوق تحت شركات نوعها «مورّد» أو «مختلط» فقط" },
        { status: 400 }
      );
    }

    const pkgRes = await db.execute({
      sql: "SELECT id, duration_days, category_scope, is_active FROM marketplace_ad_packages WHERE id = ?",
      args: [String(package_id)],
    });
    const pkg = pkgRes.rows[0];
    if (!pkg || Number(pkg.is_active ?? 0) !== 1) {
      return NextResponse.json({ error: "الباقة غير موجودة أو معطّلة" }, { status: 400 });
    }
    const durationDays = Math.min(400, Math.max(1, Math.floor(Number(pkg.duration_days ?? 30))));
    const scope = String(pkg.category_scope ?? "both");
    if (!packageMatchesCategory(scope, cat)) {
      return NextResponse.json({ error: "الباقة لا تناسب القسم" }, { status: 400 });
    }

    const imgTrim = typeof image_url === "string" ? image_url.trim() : "";
    if (imgTrim.startsWith("data:")) {
      return NextResponse.json(
        { error: "لا تُرسل صورة مضمّنة كبيرة. استخدم «رفع صورة» أو رابط URL." },
        { status: 400 }
      );
    }
    let blobCol: string | null = null;
    const blobIn = typeof image_blob_url === "string" ? image_blob_url.trim() : "";
    if (blobIn && imgTrim && blobIn === imgTrim && blobIn.includes("blob.vercel-storage.com")) {
      blobCol = blobIn;
    }

    const listingId = randomUUID();
    const now = new Date();
    const startsAt = now.toISOString().slice(0, 19).replace("T", " ");
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + durationDays);
    const endsAt = endDate.toISOString().slice(0, 19).replace("T", " ");

    await db.execute({
      sql: `INSERT INTO marketplace_listings (
        id, company_id, item_id, category, package_id, title_ar, description_ar, list_price,
        contact_phone, contact_whatsapp, image_url, image_blob_url, status, starts_at, ends_at, auto_renew,
        wallet_tx_id, created_by
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 0, NULL, ?)`,
      args: [
        listingId,
        String(company_id).trim(),
        cat,
        String(package_id),
        String(title_ar).trim(),
        description_ar?.trim() || null,
        list_price != null && Number.isFinite(Number(list_price)) ? Number(list_price) : null,
        String(contact_phone).trim(),
        contact_whatsapp?.trim() || null,
        imgTrim || null,
        blobCol,
        startsAt,
        endsAt,
        session.user.id,
      ],
    });

    return NextResponse.json({ ok: true, id: listingId, ends_at: endsAt });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل إنشاء الإعلان" }, { status: 500 });
  }
}
