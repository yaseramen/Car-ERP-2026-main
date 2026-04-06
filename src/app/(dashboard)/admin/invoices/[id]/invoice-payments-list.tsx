"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PaymentRow = {
  id: string;
  amount: number;
  method_name: string;
  created_at: string;
  reference_from?: string | null;
  reference_to?: string | null;
  reference_number?: string | null;
};

export function InvoicePaymentsList({
  invoiceId,
  invoiceType,
  status,
  payments,
}: {
  invoiceId: string;
  invoiceType: string;
  status: string;
  payments: PaymentRow[];
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canRemovePurchasePayment =
    invoiceType === "purchase" && status !== "returned" && status !== "cancelled";

  async function removePayment(paymentId: string) {
    if (
      !confirm(
        "سيتم حذف هذه الدفعة وإعادة المبلغ إلى الخزينة الرئيسية. بعدها يمكنك تعديل فاتورة الشراء. هل تريد المتابعة؟"
      )
    ) {
      return;
    }
    setDeletingId(paymentId);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/payments/${paymentId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في حذف الدفعة");
        return;
      }
      router.refresh();
    } catch {
      alert("حدث خطأ");
    } finally {
      setDeletingId(null);
    }
  }

  if (payments.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">لا توجد مدفوعات مسجلة</p>;
  }

  return (
    <>
      {canRemovePurchasePayment && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
          لتحرير فاتورة الشراء: احذف الدفعة/الدفعات من هنا أولاً (يُعاد المبلغ للخزينة)، ثم يظهر زر «تعديل فاتورة الشراء» أعلى الصفحة.
        </p>
      )}
      <ul className="space-y-3">
        {payments.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap justify-between items-center gap-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <span>
              {p.method_name} — {new Date(p.created_at).toLocaleString("ar-EG")}
              {(p.reference_from || p.reference_to) && (
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.reference_from ? `من: ${p.reference_from}` : null}
                  {p.reference_from && p.reference_to ? " — " : null}
                  {p.reference_to ? `إلى: ${p.reference_to}` : null}
                </span>
              )}
              {!p.reference_to && !p.reference_from && p.reference_number && (
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.reference_number}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">+{p.amount.toFixed(2)} ج.م</span>
              {canRemovePurchasePayment && (
                <button
                  type="button"
                  onClick={() => removePayment(p.id)}
                  disabled={deletingId === p.id}
                  className="text-xs px-2 py-1 rounded border border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/30 disabled:opacity-50"
                >
                  {deletingId === p.id ? "..." : "حذف الدفعة"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
