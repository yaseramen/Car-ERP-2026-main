import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { canAccess } from "@/lib/permissions";
import { getCompanyId } from "@/lib/company";
import { db } from "@/lib/db/client";
import { PriceListContent } from "./price-list-content";

export default async function PriceListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const allowed =
    session.user.role === "super_admin" ||
    session.user.role === "tenant_owner" ||
    (session.user.role === "employee" &&
      session.user.id &&
      (await canAccess(session.user.id, session.user.role ?? "", session.user.companyId ?? null, "inventory", "read")));
  if (!allowed) redirect("/login");

  const companyId = getCompanyId(session);
  let companyName: string | null = null;
  if (companyId) {
    const r = await db.execute({
      sql: "SELECT name FROM companies WHERE id = ?",
      args: [companyId],
    });
    companyName = r.rows[0]?.name ? String(r.rows[0].name) : null;
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <Link
          href="/admin/inventory"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          ← العودة للمخزن
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">عرض أسعار</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          اختر أصنافاً محددة أو اعرض الكل المتاح، ثم اطبع أو احفظ PDF
        </p>
      </div>
      <PriceListContent companyName={companyName} />
    </div>
  );
}
