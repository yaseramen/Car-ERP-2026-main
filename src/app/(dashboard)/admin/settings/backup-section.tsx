"use client";

import { useState } from "react";
import { getErrorMessage } from "@/lib/error-messages";

const MODULES = [
  { id: "company", label: "بيانات الشركة" },
  { id: "customers", label: "العملاء" },
  { id: "suppliers", label: "الموردون" },
  { id: "warehouses", label: "المخازن" },
  { id: "items", label: "الأصناف والمخزون" },
  { id: "invoices", label: "الفواتير" },
  { id: "repair_orders", label: "أوامر الإصلاح" },
  { id: "treasuries", label: "الخزائن" },
  { id: "stock_movements", label: "حركة المخزون" },
  { id: "payment_methods", label: "طرق الدفع" },
];

export function BackupSection() {
  const [restoreMode, setRestoreMode] = useState<"replace" | "merge">("replace");
  const [restoreModules, setRestoreModules] = useState<string[]>(MODULES.map((m) => m.id));
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleExport = (format: "json" | "excel") => {
    try {
      localStorage.setItem("alameen-last-backup", new Date().toISOString());
    } catch {}
    window.open(`/api/admin/backup/export?format=${format}`, "_blank");
  };

  const toggleModule = (id: string) => {
    setRestoreModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile) {
      setRestoreMsg({ type: "error", text: "اختر ملف النسخة الاحتياطية" });
      return;
    }
    if (restoreMode === "replace" && !confirm("وضع الاستبدال سيحذف البيانات الحالية. هل أنت متأكد؟")) {
      return;
    }
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", restoreFile);
      formData.append("mode", restoreMode);
      formData.append("modules", JSON.stringify(restoreModules));

      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setRestoreMsg({ type: "error", text: data.error || "فشل في الاستعادة" });
        return;
      }
      setRestoreMsg({ type: "success", text: data.message || "تمت الاستعادة بنجاح" });
      setRestoreFile(null);
    } catch (err) {
      setRestoreMsg({ type: "error", text: getErrorMessage(err, "حدث خطأ أثناء الاستعادة") });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">تصدير نسخة احتياطية</h2>
        <p className="text-sm text-gray-500 mb-4">
          حمّل نسخة شاملة من بيانات شركتك (عملاء، موردون، أصناف، فواتير، أوامر إصلاح، خزائن، إلخ)
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleExport("json")}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
          >
            تنزيل JSON
          </button>
          <button
            type="button"
            onClick={() => handleExport("excel")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            تنزيل Excel
          </button>
        </div>
      </div>

      <hr className="border-gray-200" />

      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">استعادة من نسخة احتياطية</h2>
        <p className="text-sm text-gray-500 mb-4">
          استعد البيانات من ملف نسخة احتياطية (JSON أو Excel). <strong>استبدال</strong> يحذف البيانات الحالية.
          <strong> دمج</strong> يضيف دون حذف.
        </p>

        <form onSubmit={handleRestore} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الملف</label>
            <input
              type="file"
              accept=".json,.xlsx,.xls"
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">وضع الاستعادة</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={restoreMode === "replace"}
                  onChange={() => setRestoreMode("replace")}
                  className="rounded-full"
                />
                <span>استبدال (حذف الحالي ثم استعادة)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={restoreMode === "merge"}
                  onChange={() => setRestoreMode("merge")}
                  className="rounded-full"
                />
                <span>دمج (إضافة دون حذف)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">البنود (استعادة جزئية)</label>
            <p className="text-xs text-gray-500 mb-2">اترك الكل محدداً للاستعادة الشاملة، أو ألغِ تحديد بعض البنود للاستعادة الجزئية</p>
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreModules.includes(m.id)}
                    onChange={() => toggleModule(m.id)}
                    className="rounded"
                  />
                  <span className="text-sm">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {restoreMsg && (
            <div
              className={`p-4 rounded-lg ${
                restoreMsg.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
              }`}
            >
              {restoreMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={restoring}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {restoring ? "جاري الاستعادة..." : "استعادة"}
          </button>
        </form>
      </div>
    </div>
  );
}
