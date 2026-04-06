import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { canAccess } from "@/lib/permissions";
import { getDistributionContext } from "@/lib/distribution";
import { getCompanyId } from "@/lib/company";
import { ensureCompanyWarehouse } from "@/lib/warehouse";
import Link from "next/link";
import { InventoryTable } from "./inventory-table";
import { TransferStock } from "./transfer-stock";
import { InventoryImportPanel } from "./inventory-import-panel";

export default async function InventoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const allowed = session.user.role === "super_admin" || session.user.role === "tenant_owner" ||
    (session.user.role === "employee" && session.user.id && await canAccess(session.user.id, session.user.role ?? "", session.user.companyId ?? null, "inventory", "read"));
  if (!allowed) redirect("/login");

  const companyId = getCompanyId(session);
  const dist =
    session.user.role === "employee" && session.user.id && companyId
      ? await getDistributionContext(session.user.id, companyId)
      : null;
  const mainWarehouseId = companyId ? await ensureCompanyWarehouse(companyId) : null;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">المخزن</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">إدارة الأصناف والمخزون</p>
          <Link
            href="/admin/inventory/price-list"
            className="inline-block mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            عرض أسعار وطباعة →
          </Link>
        </div>
        <TransferStock
          distributionMode={!!dist}
          assignedWarehouseId={dist?.assignedWarehouseId ?? null}
          assignedWarehouseName={dist?.warehouseName ?? null}
          mainWarehouseId={mainWarehouseId}
        />
      </div>

      <div className="mb-6">
        <InventoryImportPanel />
      </div>

      <InventoryTable />
    </div>
  );
}
