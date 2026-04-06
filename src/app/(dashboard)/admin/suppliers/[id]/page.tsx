import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { SupplierAccountContent } from "./supplier-account-content";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const companyId = getCompanyId(session);
  const allowed =
    session.user.role === "super_admin" ||
    session.user.role === "tenant_owner" ||
    (session.user.role === "employee" &&
      session.user.id &&
      companyId &&
      (await canAccess(session.user.id, session.user.role ?? "", companyId, "suppliers", "read")));
  if (!allowed || !companyId) redirect("/login");

  const { id } = await params;

  const supResult = await db.execute({
    sql: "SELECT id, name, phone, email, address, notes, created_at FROM suppliers WHERE id = ? AND company_id = ?",
    args: [id, companyId],
  });
  if (supResult.rows.length === 0) notFound();

  const invoicesResult = await db.execute({
    sql: `SELECT id, invoice_number, type, status, total, paid_amount, created_at
          FROM invoices
          WHERE supplier_id = ? AND company_id = ? AND type = 'purchase' AND status NOT IN ('cancelled')
          ORDER BY created_at DESC
          LIMIT 200`,
    args: [id, companyId],
  });

  const supplier = supResult.rows[0];
  const invoices = invoicesResult.rows.map((r) => ({
    id: String(r.id ?? ""),
    invoice_number: String(r.invoice_number ?? ""),
    type: String(r.type ?? ""),
    status: String(r.status ?? ""),
    total: Number(r.total ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
    balance: Number(r.total ?? 0) - Number(r.paid_amount ?? 0),
    created_at: String(r.created_at ?? ""),
  }));

  const totalPurchases = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paid_amount, 0);
  const totalBalance = invoices.reduce((s, i) => s + (i.total - i.paid_amount), 0);
  const pendingCount = invoices.filter((i) => i.status === "pending" || i.status === "partial").length;

  const data = {
    supplier: {
      id: String(supplier.id ?? ""),
      name: String(supplier.name ?? ""),
      phone: supplier.phone != null ? String(supplier.phone) : null,
      email: supplier.email != null ? String(supplier.email) : null,
      address: supplier.address != null ? String(supplier.address) : null,
      notes: supplier.notes != null ? String(supplier.notes) : null,
    },
    invoices,
    summary: { totalPurchases, totalPaid, totalBalance, invoiceCount: invoices.length, pendingCount },
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/suppliers"
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← الموردون
        </Link>
      </div>
      <SupplierAccountContent supplierId={id} initialData={data} />
    </div>
  );
}
