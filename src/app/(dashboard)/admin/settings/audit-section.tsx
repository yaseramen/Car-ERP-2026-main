"use client";

import { useState, useEffect } from "react";

const ACTION_LABELS: Record<string, string> = {
  invoice_pay: "دفع فاتورة",
  invoice_create: "إنشاء فاتورة",
  invoice_cancel: "إلغاء فاتورة",
  invoice_return: "مرتجع فاتورة",
  backup_export: "تصدير نسخة احتياطية",
  backup_restore: "استعادة نسخة احتياطية",
  customer_create: "إضافة عميل",
  customer_update: "تعديل عميل",
  customer_delete: "حذف عميل",
  supplier_create: "إضافة مورد",
  supplier_update: "تعديل مورد",
  supplier_delete: "حذف مورد",
  item_create: "إضافة صنف",
  item_update: "تعديل صنف",
  item_delete: "حذف صنف",
  stock_adjust: "تعديل مخزون",
  stock_transfer: "نقل مخزون",
  treasury_transaction: "حركة خزينة",
  treasury_expense: "إضافة مصروف",
  treasury_income: "إضافة إيراد",
  password_reset_code_issue: "إصدار كود استعادة كلمة مرور (مالك شركة)",
  user_delete: "حذف مستخدم (موظف)",
};

export function AuditSection() {
  const [logs, setLogs] = useState<Array<{ id: string; user_name: string | null; action: string; entity_type: string | null; entity_id: string | null; details: string | null; created_at: string }>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/audit?limit=20&offset=${(page - 1) * 20}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">سجل العمليات</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        تتبع من قام بماذا ومتى (دفع فواتير، تصدير، إلخ)
      </p>
      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-gray-500 dark:text-gray-400">
          جاري التحميل...
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-gray-500 dark:text-gray-400">
          لا توجد سجلات حتى الآن
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">المستخدم</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجراء</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {new Date(log.created_at).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{log.user_name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {ACTION_LABELS[log.action] || log.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{log.details || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 text-gray-700 dark:text-gray-300"
              >
                السابق
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                صفحة {page} من {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 text-gray-700 dark:text-gray-300"
              >
                التالي
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
