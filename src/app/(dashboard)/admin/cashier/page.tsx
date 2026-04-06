import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { CashierContent } from "./cashier-content";

export default async function CashierPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const companyId = getCompanyId(session);
  const allowed =
    session.user.role === "super_admin" ||
    session.user.role === "tenant_owner" ||
    (session.user.role === "employee" &&
      session.user.id &&
      (await canAccess(session.user.id, session.user.role ?? "", companyId, "cashier", "read")));
  if (!allowed) redirect("/login");

  /** مالك المركز + السوبر أدمن (اختبار/لوحة النظام) — الموظف لا يرى تكلفة الشراء */
  const showPurchaseCost =
    session.user.role === "tenant_owner" || session.user.role === "super_admin";

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">الكاشير</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">بيع القطع والخدمات — إنشاء فاتورة بيع</p>
      </div>

      <CashierContent showPurchaseCost={showPurchaseCost} />
    </div>
  );
}
