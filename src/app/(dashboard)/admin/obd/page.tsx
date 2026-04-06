import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ObdContent } from "./obd-content";
import { canAccess } from "@/lib/permissions";
import { getCompanyId } from "@/lib/company";

export default async function ObdPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  if (session.user.role === "employee") {
    const allowed = await canAccess(session.user.id, "employee", companyId, "obd", "read");
    if (!allowed) redirect("/admin");
  }

  return (
    <div className="p-4 sm:p-5 md:p-8 max-w-[100vw] overflow-x-hidden">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-[1.65rem] font-bold text-gray-900 dark:text-gray-100 text-pretty">
          تشخيص OBD — أداة EFCT
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm sm:text-base leading-relaxed max-w-4xl">
          بحث بكود، رفع تقرير، أكواد يدوية مع المركبة، تحليل بالوصف، أو قراءات حية — تُخصم التكلفة من محفظة الشركة حسب كل عملية
        </p>
      </div>

      <ObdContent isSuperAdmin={session.user.role === "super_admin"} />
    </div>
  );
}
