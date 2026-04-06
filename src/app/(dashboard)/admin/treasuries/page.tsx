import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { TreasuriesContent } from "./treasuries-content";

export default async function TreasuriesPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }
  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");
  if (session.user.role === "employee") {
    const allowed = await canAccess(session.user.id, "employee", companyId, "treasuries", "read");
    if (!allowed) redirect("/admin");
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">الخزائن</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">فصل خزينة المبيعات عن خزينة الورشة — التحويل بينهما</p>
      </div>

      <TreasuriesContent />
    </div>
  );
}
