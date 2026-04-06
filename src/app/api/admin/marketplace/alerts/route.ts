import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/company";
import { getListingAlertsForCompany } from "@/lib/marketplace";

/** تنبيهات انتهاء قريب (48 ساعة) للمورّد/المالك */
export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || session.user.role === "super_admin") {
    return NextResponse.json({ expiringSoon: [] });
  }
  if (session.user.companyBusinessType !== "supplier") {
    return NextResponse.json({ expiringSoon: [] });
  }
  if (!session.user.companyMarketplaceEnabled || session.user.companyAdsGloballyDisabled) {
    return NextResponse.json({ expiringSoon: [] });
  }

  try {
    const { expiringSoon } = await getListingAlertsForCompany(companyId);
    return NextResponse.json({ expiringSoon });
  } catch {
    return NextResponse.json({ expiringSoon: [] });
  }
}
