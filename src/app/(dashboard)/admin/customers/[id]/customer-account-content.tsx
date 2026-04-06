"use client";

import Link from "next/link";

const TYPE_LABELS: Record<string, string> = { sale: "بيع", purchase: "شراء", maintenance: "صيانة" };
const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  pending: "معلق",
  partial: "جزئي",
  paid: "مدفوع",
  returned: "مرتجع",
  cancelled: "ملغي",
};
const STAGE_LABELS: Record<string, string> = {
  received: "مستلمة",
  inspection: "فحص",
  maintenance: "صيانة",
  ready: "جاهزة",
  completed: "مكتمل",
};

interface Props {
  customerId: string;
  initialData: {
    customer: { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null };
    invoices: Array<{ id: string; invoice_number: string; type: string; status: string; total: number; paid_amount: number; balance: number; created_at: string }>;
    repair_orders: Array<{ id: string; order_number: string; vehicle_plate: string | null; stage: string; received_at: string | null; completed_at: string | null }>;
    summary: { totalSales: number; totalPaid: number; totalBalance: number; invoiceCount: number; pendingCount: number; orderCount: number };
  };
}

export function CustomerAccountContent({ customerId, initialData }: Props) {
  const { customer, invoices, repair_orders, summary } = initialData;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{customer.name}</h1>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          {customer.phone && <p>📞 {customer.phone}</p>}
          {customer.email && <p>✉️ {customer.email}</p>}
          {customer.address && <p>📍 {customer.address}</p>}
          {customer.notes && <p className="mt-2">ملاحظات: {customer.notes}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">إجمالي المبيعات</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary.totalSales.toFixed(2)} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">المدفوع</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{summary.totalPaid.toFixed(2)} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">المتبقي</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{summary.totalBalance.toFixed(2)} ج.م</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">فواتير معلقة</p>
          <p className="text-xl font-bold">{summary.pendingCount}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">كشف الفواتير</h2>
        </div>
        <div className="overflow-x-auto max-h-80">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">لا توجد فواتير</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رقم الفاتورة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">النوع</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">المدفوع</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">المتبقي</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الحالة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رابط</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm">{TYPE_LABELS[inv.type] || inv.type}</td>
                    <td className="px-4 py-3 text-sm">{new Date(inv.created_at).toLocaleDateString("ar-EG")}</td>
                    <td className="px-4 py-3 text-sm">{inv.total.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{inv.paid_amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400">{inv.balance.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{STATUS_LABELS[inv.status] || inv.status}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="text-emerald-600 dark:text-emerald-400 hover:underline text-sm"
                      >
                        عرض
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">أوامر الإصلاح</h2>
        </div>
        <div className="overflow-x-auto max-h-64">
          {repair_orders.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">لا توجد أوامر إصلاح</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رقم الأمر</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">اللوحة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الحالة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">تاريخ الاستلام</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رابط</th>
                </tr>
              </thead>
              <tbody>
                {repair_orders.map((ro) => (
                  <tr key={ro.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{ro.order_number}</td>
                    <td className="px-4 py-3 text-sm">{ro.vehicle_plate || "—"}</td>
                    <td className="px-4 py-3 text-sm">{STAGE_LABELS[ro.stage] || ro.stage}</td>
                    <td className="px-4 py-3 text-sm">{ro.received_at ? new Date(ro.received_at).toLocaleDateString("ar-EG") : "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/workshop/${ro.id}`}
                        className="text-emerald-600 dark:text-emerald-400 hover:underline text-sm"
                      >
                        عرض
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
