import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { purgeMarketplaceListingBlobImage } from "@/lib/marketplace-image-blob";

const ALLOWED = ["tenant_owner", "employee"] as const;

async function ensureMarketplace(session: { user: { id: string; role: string } }, companyId: string, action: "read" | "update" | "delete") {
  if (session.user.role !== "employee") return true;
  const map = { read: "read" as const, update: "update" as const, delete: "delete" as const };
  return canAccess(session.user.id, "employee", companyId, "marketplace", map[action]);
}

/** تحديث تجديد تلقائي فقط */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED.includes(session.user.role as (typeof ALLOWED)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (session.user.companyBusinessType !== "supplier") {
    return NextResponse.json({ error: "غير مسموح" }, { status: 403 });
  }
  if (!(await ensureMarketplace(session, companyId, "update"))) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.auto_renew !== "boolean") {
    return NextResponse.json({ error: "auto_renew مطلوب" }, { status: 400 });
  }
  try {
    const res = await db.execute({
      sql: "UPDATE marketplace_listings SET auto_renew = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [body.auto_renew ? 1 : 0, id, companyId],
    });
    const n = "rowsAffected" in res ? (res as { rowsAffected: number }).rowsAffected : 0;
    if (n === 0) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    return NextResponse.json({ ok: true, auto_renew: body.auto_renew });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل التحديث" }, { status: 500 });
  }
}

/** إلغاء إعلان (المالك/موظف) — يخفي من السوق ويمسح رابط الصورة من السجل */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || session.user.role === "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (session.user.companyBusinessType !== "supplier") {
    return NextResponse.json({ error: "غير مسموح" }, { status: 403 });
  }
  if (!(await ensureMarketplace(session, companyId, "delete"))) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const res = await db.execute({
      sql: "SELECT id, status FROM marketplace_listings WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });
    if (res.rows.length === 0) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }
    await purgeMarketplaceListingBlobImage(id);
    await db.execute({
      sql: `UPDATE marketplace_listings SET status = 'cancelled', image_url = NULL, image_blob_url = NULL,
            cancelled_at = datetime('now'), cancelled_by = ?, cancel_reason = 'user_cancel',
            updated_at = datetime('now') WHERE id = ?`,
      args: [session.user.id, id],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل الإلغاء" }, { status: 500 });
  }
}
