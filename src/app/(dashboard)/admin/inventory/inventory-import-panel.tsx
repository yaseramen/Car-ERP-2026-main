"use client";

import { useState, useCallback } from "react";

const CSV_TEMPLATE = `الاسم,الكود,الباركود,القسم,الوحدة,سعر الشراء,سعر البيع,الحد الأدنى,تتبع صلاحية,تاريخ الصلاحية
فلتر زيت,FLT-001,,فلاتر,قطعة,50,80,5,0,
زيت محرك,,,زيوت,لتر,200,280,0,1,2027-12-31`;

export function InventoryImportPanel() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; errors?: string[] } | null>(null);

  const downloadTemplate = useCallback(() => {
    const blob = new Blob(["\uFEFF" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "efct-inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/inventory/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setResult({ message: data.error || "فشل الاستيراد", errors: data.errors });
        return;
      }
      setResult({
        message: data.message || "تم الاستيراد",
        errors: data.errors,
      });
      setFile(null);
      window.dispatchEvent(new CustomEvent("alameen-inventory-refresh"));
    } catch {
      setResult({ message: "تعذر الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-right text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/80"
      >
        <span>استيراد أصناف من Excel أو CSV</span>
        <span className="text-gray-500">{open ? "▼" : "◀"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-700 space-y-4 text-sm text-gray-600 dark:text-gray-300">
          <p>
            الصف الأول يجب أن يكون <strong>عناوين الأعمدة</strong>. عمود <strong>الاسم</strong> (أو name) إلزامي. باقي الحقول اختيارية.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs leading-relaxed">
            <li>
              <strong>الاسم / name</strong> — مطلوب
            </li>
            <li>
              <strong>الكود / code</strong> — إن وُجد مكرراً في الملف أو في المخزن يُتخطى الصف
            </li>
            <li>
              <strong>الباركود</strong> — إن تُرك فارغاً يُولَّد تلقائياً
            </li>
            <li>القسم، الوحدة، سعر الشراء، سعر البيع، الحد الأدنى</li>
            <li>
              <strong>تتبع صلاحية</strong> (0/1 أو نعم) و<strong>تاريخ الصلاحية</strong> (YYYY-MM-DD) — اختياري
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
            >
              تنزيل نموذج CSV
            </button>
            <span className="text-xs text-gray-500 self-center">أو أنشئ ملف Excel بنفس الأعمدة واحفظه كـ .xlsx</span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-600 dark:text-gray-400"
            />
            <button
              type="submit"
              disabled={loading || !file}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {loading ? "جاري الاستيراد…" : "بدء الاستيراد"}
            </button>
          </form>
          {result && (
            <div
              className={`rounded-lg p-3 text-sm ${
                result.message.includes("لم يُضف") || result.message.includes("فشل")
                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
                  : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100"
              }`}
            >
              <p>{result.message}</p>
              {result.errors && result.errors.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-xs max-h-40 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
