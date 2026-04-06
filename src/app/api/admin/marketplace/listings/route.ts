import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { packageMatchesCategory, type MarketplaceCategory } from "@/lib/marketplace";

const ALLOWED = ["tenant_owner", "employee"] as const;

export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || session.user.role === "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (session.user.role === "employee") {
    const ok = await canAccess(session.user.id, "employee", companyId, "marketplace", "read");
    if (!ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (session.user.companyBusinessType !== "supplier") {
    return NextResponse.json({ listings: [] });
  }

  try {
    const res = await db.execute({
      sql: `SELECT id, title_ar, category, status, list_price, contact_phone, contact_whatsapp,
                   image_url, image_blob_url, starts_at, ends_at, auto_renew, package_id, item_id
            FROM marketplace_listings WHERE company_id = ? ORDER BY created_at DESC`,
      args: [companyId],
    });
    return NextResponse.json({
      listings: res.rows.map((r) => ({
        id: r.id,
        title_ar: r.title_ar,
        category: r.category,
        status: r.status,
        list_price: r.list_price != null ? Number(r.list_price) : null,
        contact_phone: r.contact_phone,
        contact_whatsapp: r.contact_whatsapp,
        image_url: r.image_url,
        image_blob_url: r.image_blob_url,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        auto_renew: Number(r.auto_renew ?? 0) === 1,
        package_id: r.package_id,
        item_id: r.item_id,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل الجلب" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED.includes(session.user.role as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (session.user.role === "employee") {
    const ok = await canAccess(session.user.id, "employee", companyId, "marketplace", "create");
    if (!ok) return NextResponse.json({ error: "لا تملك صلاحية إنشاء إعلان" }, { status: 403 });
  }
  if (session.user.companyBusinessType !== "supplier") {
    return NextResponse.json({ error: "السوق متاح لحسابات المورّد فقط" }, { status: 403 });
  }
  if (!session.user.companyMarketplaceEnabled) {
    return NextResponse.json({ error: "السوق غير مفعّل لشركتك. تواصل مع الإدارة." }, { status: 403 });
  }
  if (session.user.companyAdsGloballyDisabled) {
    return NextResponse.json({ error: "تم إيقاف إعلانات شركتك من الإدارة." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      title_ar,
      description_ar,
      list_price,
      category,
      package_id,
      item_id,
      contact_phone,
      contact_whatsapp,
      image_url,
      image_blob_url,
      auto_renew,
      confirm,
    } = body;

    if (confirm !== true) {
      return NextResponse.json({ error: "يجب تأكيد الخصم من المحفظة (confirm: true)" }, { status: 400 });
    }
    if (!title_ar?.trim() || !package_id || !contact_phone?.trim()) {
      return NextResponse.json({ error: "العنوان والباقة ورقم التواصل مطلوبة" }, { status: 400 });
    }
    const cat = category as MarketplaceCategory;
    if (cat !== "parts" && cat !== "workshop") {
      return NextResponse.json({ error: "قسم غير صالح" }, { status: 400 });
    }

    const pkgRes = await db.execute({
      sql: "SELECT id, price, duration_days, category_scope, is_active FROM marketplace_ad_packages WHERE id = ?",
      args: [String(package_id)],
    });
    const pkg = pkgRes.rows[0];
    if (!pkg || Number(pkg.is_active ?? 0) !== 1) {
      return NextResponse.json({ error: "الباقة غير موجودة أو معطّلة" }, { status: 400 });
    }
    const price = Number(pkg.price ?? 0);
    const durationDays = Math.min(400, Math.max(1, Math.floor(Number(pkg.duration_days ?? 1))));
    const scope = String(pkg.category_scope ?? "both");
    if (!packageMatchesCategory(scope, cat)) {
      return NextResponse.json({ error: "الباقة لا تناسب القسم المختار" }, { status: 400 });
    }

    const imgTrim = typeof image_url === "string" ? image_url.trim() : "";
    if (imgTrim.startsWith("data:")) {
      return NextResponse.json(
        { error: "لا تُرسل صورة مضمّنة كبيرة. استخدم «رفع صورة» أو أدخل رابط URL." },
        { status: 400 }
      );
    }
    let blobCol: string | null = null;
    const blobIn = typeof image_blob_url === "string" ? image_blob_url.trim() : "";
    if (blobIn && imgTrim && blobIn === imgTrim && blobIn.includes("blob.vercel-storage.com")) {
      blobCol = blobIn;
    }

    if (item_id) {
      const it = await db.execute({
        sql: "SELECT id FROM items WHERE id = ? AND company_id = ? AND is_active = 1",
        args: [String(item_id), companyId],
      });
      if (it.rows.length === 0) {
        return NextResponse.json({ error: "الصنف غير موجود" }, { status: 400 });
      }
    }

    const w = await db.execute({
      sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
      args: [companyId],
    });
    if (w.rows.length === 0) return NextResponse.json({ error: "لا توجد محفظة" }, { status: 400 });
    const walletId = String(w.rows[0].id);
    const balance = Number(w.rows[0].balance ?? 0);
    if (balance < price) {
      return NextResponse.json(
        { error: `رصيد المحفظة غير كافٍ. المطلوب ${price.toFixed(2)} ج.م — الرصيد ${balance.toFixed(2)} ج.م` },
        { status: 400 }
      );
    }

    const listingId = randomUUID();
    const txId = randomUUID();
    const now = new Date();
    const startsAt = now.toISOString().slice(0, 19).replace("T", " ");
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + durationDays);
    const endsAt = endDate.toISOString().slice(0, 19).replace("T", " ");

    const newBalance = balance - price;
    await db.execute({
      sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'marketplace_ad', ?, 'marketplace_listing', ?, ?)`,
      args: [
        txId,
        walletId,
        price,
        `إعلان سوق — ${String(pkg.label_ar ?? "")}`,
        listingId,
        session.user.id,
      ],
    });
    await db.execute({
      sql: "UPDATE company_wallets SET balance = ?, updated_at = datetime('now') WHERE id = ?",
      args: [newBalance, walletId],
    });

    await db.execute({
      sql: `INSERT INTO marketplace_listings (
        id, company_id, item_id, category, package_id, title_ar, description_ar, list_price,
        contact_phone, contact_whatsapp, image_url, image_blob_url, status, starts_at, ends_at, auto_renew,
        wallet_tx_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      args: [
        listingId,
        companyId,
        item_id ? String(item_id) : null,
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
        auto_renew === true ? 1 : 0,
        txId,
        session.user.id,
      ],
    });

    return NextResponse.json({
      ok: true,
      id: listingId,
      new_balance: newBalance,
      ends_at: endsAt,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل إنشاء الإعلان" }, { status: 500 });
  }
}
