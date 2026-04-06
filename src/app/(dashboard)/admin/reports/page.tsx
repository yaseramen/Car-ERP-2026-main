import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCompanyId } from "@/lib/company";
import { ReportsContent } from "./reports-content";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }
  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">التقارير</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">نظرة على أداء النظام واتخاذ القرارات</p>
      </div>

      <ReportsContent />
    </div>
  );
}
