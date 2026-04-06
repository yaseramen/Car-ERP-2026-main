"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addToQueue } from "@/lib/offline-queue";

interface InvoiceItem {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface PartialReturnButtonProps {
  invoiceId: string;
  type: string;
  status: string;
  items: InvoiceItem[];
}

export function PartialReturnButton({ invoiceId, type, status, items }: PartialReturnButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});

  const canReturn = ["sale", "maintenance", "purchase"].includes(type) && status !== "returned" && status !== "cancelled";
  const returnableItems = items.filter((i) => i.item_id);

  useEffect(() => {
    const handleOnline = () => router.refresh();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, [router]);

  if (!canReturn || returnableItems.length === 0) return null;

  function handleOpen() {
    const init: Record<string, number> = {};
    returnableItems.forEach((i) => {
      if (i.item_id) init[i.item_id] = 0;
    });
    setReturnQtys(init);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const toReturn = returnableItems
      .filter((i) => i.item_id && (returnQtys[i.item_id] ?? 0) > 0)
      .map((i) => ({ item_id: i.item_id!, quantity: returnQtys[i.item_id!] ?? 0 }));

    if (toReturn.length === 0) {
      alert("حدد الكميات المراد إرجاعها");
      return;
    }

    for (const r of toReturn) {
      const item = returnableItems.find((i) => i.item_id === r.item_id);
      if (item && r.quantity > item.quantity) {
        alert(`كمية "${item.item_name}" تتجاوز الكمية في الفاتورة (${item.quantity})`);
        return;
      }
    }

    const payload = { items: toReturn };

    setLoading(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "invoice_return_partial", invoiceId, data: payload });
        setOpen(false);
        alert("انقطع الاتصال. تم حفظ الإرجاع الجزئي محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch(`/api/admin/invoices/${invoiceId}/return-partial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في تنفيذ المرتجع");
        return;
      }
      setOpen(false);
      if (data.return_invoice_id) {
        router.push(`/admin/invoices/${data.return_invoice_id}`);
      } else {
        router.refresh();
      }
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "invoice_return_partial", invoiceId, data: payload });
        setOpen(false);
        alert("انقطع الاتصال. تم حفظ الإرجاع الجزئي محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="no-print px-4 py-2 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800/70 text-blue-800 dark:text-blue-200 font-medium rounded-lg transition-colors"
      >
        إرجاع جزئي
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">إرجاع جزئي</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">حدد الكميات المراد إرجاعها للمخزن</p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {returnableItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{item.item_name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      الكمية في الفاتورة: {item.quantity} — {item.unit_price.toFixed(2)} ج.م
                    </div>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min="0"
                      max={item.quantity}
                      step="0.01"
                      value={returnQtys[item.item_id!] ?? 0}
                      onChange={(e) =>
                        setReturnQtys((prev) => ({
                          ...prev,
                          [item.item_id!]: Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0)),
                        }))
                      }
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                >
                  {loading ? "جاري..." : "تنفيذ الإرجاع"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
