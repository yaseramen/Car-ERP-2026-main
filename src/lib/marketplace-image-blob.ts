import { del } from "@vercel/blob";
import { db } from "@/lib/db/client";

/** حذف ملف من Vercel Blob إن وُجد التوكن والرابط يبدو من تخزيننا */
export async function deleteMarketplaceImageBlob(blobUrl: string | null | undefined): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || !blobUrl?.trim()) return;
  const u = blobUrl.trim();
  if (!u.includes("blob.vercel-storage.com")) return;
  try {
    await del(u, { token });
  } catch (e) {
    console.warn("[marketplace] blob delete skipped:", e);
  }
}

/** يقرأ image_blob_url للإعلان ويحذف الملف من Blob */
export async function purgeMarketplaceListingBlobImage(listingId: string): Promise<void> {
  try {
    const r = await db.execute({
      sql: "SELECT image_blob_url FROM marketplace_listings WHERE id = ?",
      args: [listingId],
    });
    const url = r.rows[0]?.image_blob_url ? String(r.rows[0].image_blob_url) : null;
    await deleteMarketplaceImageBlob(url);
  } catch (e) {
    console.warn("[marketplace] purge listing blob:", e);
  }
}
