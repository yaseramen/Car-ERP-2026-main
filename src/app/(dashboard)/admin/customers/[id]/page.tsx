import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { CustomerAccountContent } from "./customer-account-content";

export default async function CustomerDetailPage({
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
      (await canAccess(session.user.id, session.user.role ?? "", companyId, "customers", "read")));
  if (!allowed || !companyId) redirect("/login");

  const { id } = await params;

  const custResult = await db.execute({
    sql: "SELECT id, name, phone, email, address, notes, created_at FROM customers WHERE id = ? AND company_id = ?",
    args: [id, companyId],
  });
  if (custResult.rows.length === 0) notFound();

  const invoicesResult = await db.execute({
    sql: `SELECT id, invoice_number, type, status, total, paid_amount, created_at
          FROM invoices
          WHERE customer_id = ? AND company_id = ? AND status NOT IN ('cancelled')
          ORDER BY created_at DESC
          LIMIT 200`,
    args: [id, companyId],
  });

  const ordersResult = await db.execute({
    sql: `SELECT id, order_number, vehicle_plate, stage, received_at, completed_at
          FROM repair_orders
          WHERE customer_id = ? AND company_id = ?
          ORDER BY received_at DESC
          LIMIT 100`,
    args: [id, companyId],
  });

  const customer = custResult.rows[0];
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
  const repair_orders = ordersResult.rows.map((r) => ({
    id: String(r.id ?? ""),
    order_number: String(r.order_number ?? ""),
    vehicle_plate: r.vehicle_plate != null ? String(r.vehicle_plate) : null,
    stage: String(r.stage ?? ""),
    received_at: r.received_at != null ? String(r.received_at) : null,
    completed_at: r.completed_at != null ? String(r.completed_at) : null,
  }));

  const totalSales = invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paid_amount, 0);
  const totalBalance = invoices.reduce((s, i) => s + (i.total - i.paid_amount), 0);
  const pendingCount = invoices.filter((i) => i.status === "pending" || i.status === "partial").length;

  const data = {
    customer: {
      id: String(customer.id ?? ""),
      name: String(customer.name ?? ""),
      phone: customer.phone != null ? String(customer.phone) : null,
      email: customer.email != null ? String(customer.email) : null,
      address: customer.address != null ? String(customer.address) : null,
      notes: customer.notes != null ? String(customer.notes) : null,
    },
    invoices,
    repair_orders,
    summary: { totalSales, totalPaid, totalBalance, invoiceCount: invoices.length, pendingCount, orderCount: repair_orders.length },
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/admin/customers"
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← العملاء
        </Link>
      </div>
      <CustomerAccountContent customerId={id} initialData={data} />
    </div>
  );
}
