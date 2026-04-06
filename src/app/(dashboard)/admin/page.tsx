import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardContent } from "./dashboard-content";
import { canAccess, getFirstAllowedRoute } from "@/lib/permissions";
import { getCompanyId } from "@/lib/company";

export default async function AdminDashboardPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  if (session.user.role === "employee") {
    const allowed = await canAccess(session.user.id, "employee", companyId, "dashboard", "read");
    if (!allowed) {
      const firstRoute = await getFirstAllowedRoute(session.user.id);
      if (firstRoute) redirect(firstRoute);
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">الرئيسية</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">مرحباً، {session?.user?.name || session?.user?.email}</p>
        <p className="mt-3 text-sm">
          <Link href="/admin/help" className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
            الدليل وما الجديد
          </Link>
          <span className="text-gray-500 dark:text-gray-400"> — شرح الاستخدام وآخر التحديثات</span>
        </p>
      </div>

      <DashboardContent
        isSuperAdmin={session.user.role === "super_admin"}
        isTenantOwner={session.user.role === "tenant_owner"}
      />
    </div>
  );
}
