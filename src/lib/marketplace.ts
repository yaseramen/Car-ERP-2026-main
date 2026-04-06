import { db } from "@/lib/db/client";

export type MarketplaceCategory = "parts" | "workshop";

export function packageMatchesCategory(
  scope: string,
  category: MarketplaceCategory
): boolean {
  if (scope === "both") return true;
  return scope === category;
}

/** جلب إعلانات منتهية أو تحتاج تذكير (48 ساعة) */
export async function getListingAlertsForCompany(companyId: string): Promise<{
  expiringSoon: { id: string; title_ar: string; ends_at: string }[];
}> {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const nowStr = now.toISOString().slice(0, 19).replace("T", " ");
  const endStr = in48h.toISOString().slice(0, 19).replace("T", " ");

  const res = await db.execute({
    sql: `SELECT id, title_ar, ends_at FROM marketplace_listings
          WHERE company_id = ? AND status = 'active' AND ends_at > ? AND ends_at <= ?
          ORDER BY ends_at ASC`,
    args: [companyId, nowStr, endStr],
  });

  return {
    expiringSoon: res.rows.map((r) => ({
      id: String(r.id),
      title_ar: String(r.title_ar ?? ""),
      ends_at: String(r.ends_at ?? ""),
    })),
  };
}
