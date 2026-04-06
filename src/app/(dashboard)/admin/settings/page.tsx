import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCompanyId } from "@/lib/company";
import { CompanySettingsContent } from "./company-settings-content";
import { BackupSection } from "./backup-section";
import { WarehousesSection } from "@/app/(dashboard)/admin/settings/warehouses-section";
import { AuditSection } from "./audit-section";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">إعدادات الشركة</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        بيانات الشركة التي تظهر على الفواتير — ويمكنك رفع شعار يظهر في القائمة الجانبية وطباعة الفاتورة.
      </p>
      <CompanySettingsContent />

      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">النسخ الاحتياطي والاستعادة</h2>
        <BackupSection />
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">إدارة المخازن</h2>
        <WarehousesSection />
      </div>

      <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <AuditSection />
      </div>
    </div>
  );
}
