import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { canAccess } from "@/lib/permissions";
import { getCompanyId } from "@/lib/company";
import { MarketplaceContent } from "./marketplace-content";
import Link from "next/link";

export default async function MarketplacePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuperAdmin = session.user.role === "super_admin";
  const companyId = getCompanyId(session);

  if (!isSuperAdmin) {
    if (!companyId) redirect("/login");
    if (session.user.companyBusinessType !== "supplier") {
      redirect("/admin");
    }
    if (session.user.role === "employee") {
      const ok = await canAccess(session.user.id, "employee", companyId, "marketplace", "read");
      if (!ok) redirect("/admin");
    }
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">السوق والإعلانات</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            إدارة إعلانات الظهور في{" "}
            <Link href="/market" className="text-emerald-600 hover:underline" target="_blank">
              صفحة السوق العامة
            </Link>
          </p>
        </div>
      </div>
      <MarketplaceContent isSuperAdmin={isSuperAdmin} />
    </div>
  );
}
