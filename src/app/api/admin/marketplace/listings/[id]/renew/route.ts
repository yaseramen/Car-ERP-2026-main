import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { randomUUID } from "crypto";

const ALLOWED = ["tenant_owner", "employee"] as const;

/** تجديد يدوي لإعلام نشط أو منتهي قريباً */
export async function POST(
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
  if (session.user.role === "employee") {
    const ok = await canAccess(session.user.id, "employee", companyId, "marketplace", "create");
    if (!ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (!session.user.companyMarketplaceEnabled || session.user.companyAdsGloballyDisabled) {
    return NextResponse.json({ error: "السوق غير متاح" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json({ error: "يجب تأكيد الخصم (confirm: true)" }, { status: 400 });
  }

  const { id } = await params;

  try {
    const lRes = await db.execute({
      sql: `SELECT l.id, l.status, l.package_id, l.company_id
            FROM marketplace_listings l WHERE l.id = ? AND l.company_id = ?`,
      args: [id, companyId],
    });
    if (lRes.rows.length === 0) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    const status = String(lRes.rows[0].status);
    if (status !== "active" && status !== "expired") {
      return NextResponse.json({ error: "لا يمكن تجديد هذا الإعلان" }, { status: 400 });
    }

    const pkgRes = await db.execute({
      sql: "SELECT price, duration_days, label_ar FROM marketplace_ad_packages WHERE id = ? AND is_active = 1",
      args: [String(lRes.rows[0].package_id)],
    });
    if (pkgRes.rows.length === 0) return NextResponse.json({ error: "الباقة غير متاحة" }, { status: 400 });
    const price = Number(pkgRes.rows[0].price ?? 0);
    const days = Math.min(400, Math.max(1, Math.floor(Number(pkgRes.rows[0].duration_days ?? 1))));

    const w = await db.execute({
      sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
      args: [companyId],
    });
    const walletId = String(w.rows[0].id);
    const balance = Number(w.rows[0].balance ?? 0);
    if (balance < price) {
      return NextResponse.json({ error: `رصيد غير كافٍ — مطلوب ${price.toFixed(2)} ج.م` }, { status: 400 });
    }

    const txId = randomUUID();
    const newBalance = balance - price;
    const curEndRes = await db.execute({
      sql: "SELECT ends_at FROM marketplace_listings WHERE id = ?",
      args: [id],
    });
    const curEndStr = curEndRes.rows[0]?.ends_at ? String(curEndRes.rows[0].ends_at) : null;
    const base =
      status === "active" && curEndStr
        ? new Date(curEndStr.replace(" ", "T"))
        : new Date();
    if (Number.isNaN(base.getTime())) base.setTime(Date.now());
    base.setDate(base.getDate() + days);
    const newEnds = base.toISOString().slice(0, 19).replace("T", " ");

    await db.execute({
      sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'marketplace_ad', ?, 'marketplace_listing', ?, ?)`,
      args: [
        txId,
        walletId,
        price,
        `تجديد إعلان سوق — ${String(pkgRes.rows[0].label_ar ?? "")}`,
        id,
        session.user.id,
      ],
    });
    await db.execute({
      sql: "UPDATE company_wallets SET balance = ?, updated_at = datetime('now') WHERE id = ?",
      args: [newBalance, walletId],
    });
    await db.execute({
      sql: `UPDATE marketplace_listings SET status = 'active', ends_at = ?, wallet_tx_id = ?,
            updated_at = datetime('now'), last_reminder_at = NULL WHERE id = ?`,
      args: [newEnds, txId, id],
    });

    return NextResponse.json({ ok: true, new_balance: newBalance, ends_at: newEnds });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل التجديد" }, { status: 500 });
  }
}
