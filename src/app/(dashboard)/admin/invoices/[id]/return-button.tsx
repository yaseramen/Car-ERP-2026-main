"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addToQueue } from "@/lib/offline-queue";

interface ReturnButtonProps {
  invoiceId: string;
  type: string;
  status: string;
}

export function ReturnButton({ invoiceId, type, status }: ReturnButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const canReturn = ["sale", "maintenance", "purchase"].includes(type) && status !== "returned" && status !== "cancelled";

  useEffect(() => {
    const handleOnline = () => router.refresh();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, [router]);

  if (!canReturn) return null;

  async function handleReturn() {
    if (!confirm("هل أنت متأكد من تحويل هذه الفاتورة إلى مرتجع؟ سيتم إعادة الأصناف للمخزن (أو خصمها في فواتير الشراء).")) return;

    setLoading(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "invoice_return", invoiceId });
        alert("انقطع الاتصال. تم حفظ المرتجع محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch(`/api/admin/invoices/${invoiceId}/return`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في تنفيذ المرتجع");
        return;
      }
      router.refresh();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "invoice_return", invoiceId });
        alert("انقطع الاتصال. تم حفظ المرتجع محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
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
      onClick={handleReturn}
      disabled={loading}
      className="no-print px-4 py-2 bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-800/70 text-amber-800 dark:text-amber-200 font-medium rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? "جاري..." : "جعل مرتجع"}
    </button>
  );
}
