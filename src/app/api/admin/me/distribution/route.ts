import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/company";
import { getDistributionContext } from "@/lib/distribution";
import { ensureCompanyWarehouse } from "@/lib/warehouse";

export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId) {
    return NextResponse.json({ distribution: null });
  }

  if (session.user.role !== "employee") {
    return NextResponse.json({ distribution: null });
  }

  const ctx = await getDistributionContext(session.user.id, companyId);
  if (!ctx) {
    return NextResponse.json({ distribution: null });
  }

  const mainWarehouseId = await ensureCompanyWarehouse(companyId);

  return NextResponse.json({
    distribution: {
      warehouse_id: ctx.assignedWarehouseId,
      warehouse_name: ctx.warehouseName,
      main_warehouse_id: mainWarehouseId,
      distribution_treasury_id: ctx.distributionTreasuryId,
      treasury_balance: ctx.treasuryBalance,
    },
  });
}
