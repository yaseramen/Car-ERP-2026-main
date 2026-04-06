import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { SuppliersContent } from "./suppliers-content";

export default async function SuppliersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const companyId = getCompanyId(session);
  const allowed =
    session.user.role === "super_admin" ||
    session.user.role === "tenant_owner" ||
    (session.user.role === "employee" &&
      session.user.id &&
      (await canAccess(session.user.id, session.user.role ?? "", companyId, "suppliers", "read")));
  if (!allowed) redirect("/login");

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">الموردون</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">إدارة الموردين وربطهم بفواتير الشراء</p>
      </div>

      <SuppliersContent />
    </div>
  );
}
