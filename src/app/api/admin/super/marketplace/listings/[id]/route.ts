import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { purgeMarketplaceListingBlobImage } from "@/lib/marketplace-image-blob";

/** إيقاف إعلان من أي شركة (طوارئ) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await purgeMarketplaceListingBlobImage(id);
    const res = await db.execute({
      sql: `UPDATE marketplace_listings SET status = 'cancelled', image_url = NULL, image_blob_url = NULL,
            cancelled_at = datetime('now'), cancelled_by = ?, cancel_reason = 'super_admin',
            updated_at = datetime('now') WHERE id = ?`,
      args: [session.user.id, id],
    });
    const n = "rowsAffected" in res ? (res as { rowsAffected: number }).rowsAffected : 0;
    if (n === 0) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
