import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PurchasesContent } from "./purchases-content";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; qty?: string; supplier?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const params = await searchParams;

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">فواتير الشراء</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">تسجيل مشتريات المخزون من الموردين</p>
      </div>

      <PurchasesContent initialItemId={params.item} initialQty={params.qty} initialSupplierId={params.supplier} />
    </div>
  );
}
