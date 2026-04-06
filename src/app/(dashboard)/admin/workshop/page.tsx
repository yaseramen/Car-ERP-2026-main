import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { WorkshopContent } from "./workshop-content";
import { canAccess } from "@/lib/permissions";
import { getCompanyId } from "@/lib/company";

export default async function WorkshopPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  if (session.user.role === "employee") {
    const allowed = await canAccess(session.user.id, "employee", companyId, "workshop", "read");
    if (!allowed) redirect("/admin");
  }

  /** مالك المركز + السوبر أدمن — الموظف لا يرى تكلفة الشراء */
  const showPurchaseCost =
    session.user.role === "tenant_owner" || session.user.role === "super_admin";

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">الورشة</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          دورة السيارة: استلام → فحص → صيانة → جاهزة → فاتورة وخروج
        </p>
      </div>

      <WorkshopContent showPurchaseCost={showPurchaseCost} />
    </div>
  );
}
