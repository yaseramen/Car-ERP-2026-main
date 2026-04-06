import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { normalizeBusinessType } from "@/lib/business-types";

const EXCLUDED_IDS = ["company-system", "company-demo"];

/** حظر الشركة، أو تعديلات السوبر أدمن: نوع النشاط، تفعيل السوق، إيقاف الإعلانات */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;
  if (EXCLUDED_IDS.includes(id)) {
    return NextResponse.json({ error: "لا يمكن تعديل هذه الشركة" }, { status: 400 });
  }

  try {
    const body = await _request.json().catch(() => ({}));

    const is_active =
      body.is_active === true ? 1 : body.is_active === false ? 0 : undefined;
    const business_type =
      typeof body.business_type === "string" ? normalizeBusinessType(body.business_type) : undefined;
    const marketplace_enabled =
      body.marketplace_enabled === true ? 1 : body.marketplace_enabled === false ? 0 : undefined;
    const ads_globally_disabled =
      body.ads_globally_disabled === true ? 1 : body.ads_globally_disabled === false ? 0 : undefined;

    const hasBlockOnly =
      is_active !== undefined &&
      business_type === undefined &&
      marketplace_enabled === undefined &&
      ads_globally_disabled === undefined;

    if (
      is_active === undefined &&
      business_type === undefined &&
      marketplace_enabled === undefined &&
      ads_globally_disabled === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "أرسل أحد الحقول: is_active، business_type، marketplace_enabled، ads_globally_disabled",
        },
        { status: 400 }
      );
    }

    if (hasBlockOnly) {
      const res = await db.execute({
        sql: "UPDATE companies SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
        args: [is_active, id],
      });
      const rowsAffected = "rowsAffected" in res ? (res as { rowsAffected: number }).rowsAffected : 0;
      if (rowsAffected === 0) {
        return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 404 });
      }
      return NextResponse.json({ success: true, is_active: is_active === 1 });
    }

    const updates: string[] = [];
    const args: (string | number)[] = [];
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      args.push(is_active);
    }
    if (business_type !== undefined) {
      updates.push("business_type = ?");
      args.push(business_type);
    }
    if (marketplace_enabled !== undefined) {
      updates.push("marketplace_enabled = ?");
      args.push(marketplace_enabled);
    }
    if (ads_globally_disabled !== undefined) {
      updates.push("ads_globally_disabled = ?");
      args.push(ads_globally_disabled);
    }
    updates.push("updated_at = datetime('now')");
    args.push(id);

    const res = await db.execute({
      sql: `UPDATE companies SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });
    const rowsAffected = "rowsAffected" in res ? (res as { rowsAffected: number }).rowsAffected : 0;
    if (rowsAffected === 0) {
      return NextResponse.json({ error: "الشركة غير موجودة" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      ...(is_active !== undefined && { is_active: is_active === 1 }),
      ...(business_type !== undefined && { business_type }),
      ...(marketplace_enabled !== undefined && { marketplace_enabled: marketplace_enabled === 1 }),
      ...(ads_globally_disabled !== undefined && { ads_globally_disabled: ads_globally_disabled === 1 }),
    });
  } catch (error) {
    console.error("Company patch error:", error);
    return NextResponse.json({ error: "فشل في التعديل" }, { status: 500 });
  }
}

/** حذف الشركة وجميع بياناتها — يُسمح بإعادة التسجيل لاحقاً */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;
  if (EXCLUDED_IDS.includes(id)) {
    return NextResponse.json({ error: "لا يمكن حذف هذه الشركة" }, { status: 400 });
  }

  try {
    try {
      const usersResult = await db.execute({
        sql: "SELECT email FROM users WHERE company_id = ? AND role = 'tenant_owner'",
        args: [id],
      });
      for (const row of usersResult.rows) {
        const email = String(row.email ?? "").toLowerCase().trim();
        if (email) {
          await db.execute({
            sql: "INSERT OR IGNORE INTO welcome_gift_excluded_emails (email) VALUES (?)",
            args: [email],
          });
        }
      }
    } catch {
      // جدول welcome_gift_excluded_emails قد لا يكون موجوداً بعد
    }
    await db.execute({ sql: "DELETE FROM companies WHERE id = ?", args: [id] });
    return NextResponse.json({ success: true, message: "تم حذف الشركة وكل بياناتها. يمكن للأعضاء إعادة التسجيل." });
  } catch (error) {
    console.error("Company delete error:", error);
    return NextResponse.json({ error: "فشل في الحذف" }, { status: 500 });
  }
}
