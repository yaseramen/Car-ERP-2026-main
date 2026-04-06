import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { purgeMarketplaceListingBlobImage } from "@/lib/marketplace-image-blob";
import { randomUUID } from "crypto";

/**
 * انتهاء الإعلانات وتجديد تلقائي عند الرصيد.
 * جدولة: Vercel Cron → GET مع ترويسة Authorization: Bearer CRON_SECRET
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  let expired = 0;
  let renewed = 0;

  const due = await db.execute({
    sql: `SELECT l.id, l.company_id, l.package_id, l.auto_renew, l.ends_at, l.image_url, l.image_blob_url,
                 p.price, p.duration_days, p.label_ar,
                 COALESCE(c.marketplace_enabled, 1) as me,
                 COALESCE(c.ads_globally_disabled, 0) as adg,
                 w.id as wallet_id, w.balance
          FROM marketplace_listings l
          JOIN marketplace_ad_packages p ON p.id = l.package_id
          JOIN companies c ON c.id = l.company_id
          JOIN company_wallets w ON w.company_id = l.company_id
          WHERE l.status = 'active' AND l.ends_at IS NOT NULL AND l.ends_at <= ?`,
    args: [now],
  });

  for (const row of due.rows) {
    const listingId = String(row.id);
    const price = Number(row.price ?? 0);
    const durationDays = Number(row.duration_days ?? 0);
    const autoRenew = Number(row.auto_renew ?? 0) === 1;
    const walletId = String(row.wallet_id);
    const balance = Number(row.balance ?? 0);
    const me = Number(row.me ?? 1) === 1;
    const adg = Number(row.adg ?? 0) === 1;
    const sysUser = await db.execute({
      sql: "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1",
    });
    const performedBy = sysUser.rows[0]?.id ? String(sysUser.rows[0].id) : "";

    if (autoRenew && me && !adg && price > 0 && balance >= price && performedBy) {
      const days = Math.min(366, Math.max(1, Math.floor(durationDays)));
      const newBalance = balance - price;
      const txId = randomUUID();
      const endRes = await db.execute({
        sql: `SELECT datetime(ends_at, ?) as ne FROM marketplace_listings WHERE id = ?`,
        args: [`+${days} days`, listingId],
      });
      const newEnds = String(endRes.rows[0]?.ne ?? now);

      await db.execute({
        sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'marketplace_ad', ?, 'marketplace_listing', ?, ?)`,
        args: [
          txId,
          walletId,
          price,
          `تجديد تلقائي — ${String(row.label_ar ?? "إعلان سوق")}`,
          listingId,
          performedBy,
        ],
      });
      await db.execute({
        sql: "UPDATE company_wallets SET balance = ?, updated_at = datetime('now') WHERE id = ?",
        args: [newBalance, walletId],
      });
      await db.execute({
        sql: `UPDATE marketplace_listings SET ends_at = ?, wallet_tx_id = ?, updated_at = datetime('now'), last_reminder_at = NULL
              WHERE id = ?`,
        args: [newEnds, txId, listingId],
      });
      renewed++;
      continue;
    }

    await purgeMarketplaceListingBlobImage(listingId);
    await db.execute({
      sql: `UPDATE marketplace_listings SET status = 'expired', image_url = NULL, image_blob_url = NULL, updated_at = datetime('now') WHERE id = ?`,
      args: [listingId],
    });
    expired++;
  }

  return NextResponse.json({ ok: true, expired, renewed, processed: due.rows.length });
}
