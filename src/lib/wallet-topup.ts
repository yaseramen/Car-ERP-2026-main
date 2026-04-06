import { del } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { WALLET_TOPUP_MAX_RECEIPT_BLOBS_PER_COMPANY } from "@/lib/wallet-topup-constants";

export { WALLET_TOPUP_MIN_AMOUNT, WALLET_TOPUP_MAX_RECEIPT_BLOBS_PER_COMPANY } from "@/lib/wallet-topup-constants";

export async function deleteWalletTopupReceiptBlob(blobUrl: string | null | undefined): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !blobUrl?.trim()) return;
  const u = blobUrl.trim();
  if (!u.includes("blob.vercel-storage.com")) return;
  try {
    await del(u, { token });
  } catch (e) {
    console.warn("[wallet-topup] blob delete skipped:", e);
  }
}

/**
 * بعد قبول/رفض الطلب: إن تجاوزت الشركة 5 إيصالات منفَّذة، يُحذف أقدم ملف من Blob
 * ويُفرغ الحقل في السجل. لا يُستهدف طلب معلّق.
 */
export async function trimProcessedReceiptBlobsForCompany(companyId: string): Promise<void> {
  const r = await db.execute({
    sql: `SELECT id, receipt_blob_url FROM wallet_topup_requests
          WHERE company_id = ? AND status IN ('approved', 'rejected')
          AND receipt_blob_url IS NOT NULL AND TRIM(receipt_blob_url) != ''
          ORDER BY datetime(COALESCE(processed_at, created_at)) ASC`,
    args: [companyId],
  });
  const rows = r.rows;
  if (rows.length <= WALLET_TOPUP_MAX_RECEIPT_BLOBS_PER_COMPANY) return;

  const excess = rows.length - WALLET_TOPUP_MAX_RECEIPT_BLOBS_PER_COMPANY;
  for (let i = 0; i < excess; i++) {
    const id = String(rows[i].id ?? "");
    const url = rows[i].receipt_blob_url ? String(rows[i].receipt_blob_url) : "";
    if (!id || !url) continue;
    await deleteWalletTopupReceiptBlob(url);
    await db.execute({
      sql: "UPDATE wallet_topup_requests SET receipt_blob_url = '' WHERE id = ?",
      args: [id],
    });
  }
}
