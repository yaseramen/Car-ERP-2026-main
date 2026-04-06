"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addToQueue } from "@/lib/offline-queue";

interface CancelButtonProps {
  invoiceId: string;
  type: string;
  status: string;
}

export function CancelButton({ invoiceId, type, status }: CancelButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const canCancel = ["sale", "maintenance", "purchase"].includes(type) && status !== "returned" && status !== "cancelled";

  useEffect(() => {
    const handleOnline = () => router.refresh();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, [router]);

  if (!canCancel) return null;

  async function handleCancel() {
    if (
      !confirm(
        "هل أنت متأكد من إلغاء هذه الفاتورة؟ سيتم إرجاع الأصناف للمخزن واسترداد المدفوعات. لا يمكن التراجع عن هذا الإجراء."
      )
    )
      return;

    setLoading(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "invoice_cancel", invoiceId });
        alert("انقطع الاتصال. تم حفظ الإلغاء محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch(`/api/admin/invoices/${invoiceId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إلغاء الفاتورة");
        return;
      }
      router.refresh();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "invoice_cancel", invoiceId });
        alert("انقطع الاتصال. تم حفظ الإلغاء محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={loading}
      className="no-print px-4 py-2 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/70 text-red-800 dark:text-red-200 font-medium rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "جاري..." : "إلغاء الفاتورة"}
    </button>
  );
}
