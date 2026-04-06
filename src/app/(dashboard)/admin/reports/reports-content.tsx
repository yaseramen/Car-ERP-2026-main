"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { exportToExcel, exportToPdf } from "@/lib/export-reports";
import { getErrorMessage } from "@/lib/error-messages";

const STAGE_LABELS: Record<string, string> = {
  received: "استلام",
  inspection: "فحص",
  maintenance: "صيانة",
  ready: "جاهزة",
  completed: "مكتمل",
};

const MOVEMENT_LABELS: Record<string, string> = {
  in: "إدخال",
  out: "إخراج",
  transfer: "نقل",
  adjustment: "تعديل",
  workshop_install: "تركيب ورشة",
  return: "مرتجع",
};

const ROWS_PER_PAGE = 50;

type Tab = "summary" | "sales" | "profit" | "inventory" | "workshop" | "distribution" | "expenses" | "suppliers";

function PaginationControls({
  page,
  totalItems,
  onPageChange,
}: { page: number; totalItems: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100 dark:border-gray-700">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
      >
        السابق
      </button>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        صفحة {page} من {totalPages} — عرض {Math.min((page - 1) * ROWS_PER_PAGE + 1, totalItems)} إلى {Math.min(page * ROWS_PER_PAGE, totalItems)} من {totalItems}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
      >
        التالي
      </button>
    </div>
  );
}

export function ReportsContent() {
  const [tab, setTab] = useState<Tab>("summary");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [sales, setSales] = useState<Record<string, unknown> | null>(null);
  const [profit, setProfit] = useState<Record<string, unknown> | null>(null);
  const [inventory, setInventory] = useState<Record<string, unknown> | null>(null);
  const [workshop, setWorkshop] = useState<Record<string, unknown> | null>(null);
  const [expensesIncome, setExpensesIncome] = useState<Record<string, unknown> | null>(null);
  const [expenseIncomeNames, setExpenseIncomeNames] = useState<string[]>([]);
  const [expenseNameFilter, setExpenseNameFilter] = useState("");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<"" | "expense" | "income">("");
  const [suppliersReport, setSuppliersReport] = useState<Record<string, unknown> | null>(null);
  const [distributionReport, setDistributionReport] = useState<{
    flexible_policy?: boolean;
    policy_note?: string;
    distributors?: Array<{
      user_name: string;
      warehouse_name: string;
      treasury_balance_now: number;
      stock_quantity_total: number;
      period_cash_in: number | null;
      period_settled_to_main: number | null;
    }>;
    not_a_distributor?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => {
    try {
      const s = localStorage.getItem("alameen-reports-dateFrom");
      if (s) return s;
    } catch {}
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("alameen-reports-dateFrom", dateFrom);
    } catch {}
  }, [dateFrom]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [tab, dateFrom, dateTo, searchQuery, expenseNameFilter, expenseTypeFilter]);

  function setDateRange(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().slice(0, 10));
    setDateTo(to.toISOString().slice(0, 10));
  }

  function filterBySearch<T>(items: T[], getSearchText: (item: T) => string): T[] {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => getSearchText(item).toLowerCase().includes(q));
  }

  async function fetchSummary() {
    try {
      const res = await fetch("/api/admin/reports/summary");
      if (res.ok) setSummary(await res.json());
    } catch (err) {
      console.error("Reports summary fetch error:", err);
    }
  }

  async function fetchSales() {
    try {
      const res = await fetch(`/api/admin/reports/sales?from=${dateFrom}&to=${dateTo}`);
      if (res.ok) setSales(await res.json());
    } catch (err) {
      console.error("Reports sales fetch error:", err);
    }
  }

  async function fetchProfit() {
    try {
      const res = await fetch(`/api/admin/reports/profit?from=${dateFrom}&to=${dateTo}`);
      if (res.ok) setProfit(await res.json());
    } catch {}
  }

  async function fetchInventory() {
    try {
      const res = await fetch(`/api/admin/reports/inventory?from=${dateFrom}&to=${dateTo}`);
      if (res.ok) setInventory(await res.json());
    } catch {}
  }

  async function fetchWorkshop() {
    try {
      const res = await fetch(`/api/admin/reports/workshop?from=${dateFrom}&to=${dateTo}`);
      if (res.ok) setWorkshop(await res.json());
    } catch {}
  }

  async function fetchExpensesIncome() {
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo, limit: String(ROWS_PER_PAGE), offset: String((page - 1) * ROWS_PER_PAGE) });
      if (expenseNameFilter) params.set("name", expenseNameFilter);
      if (expenseTypeFilter) params.set("type", expenseTypeFilter);
      const res = await fetch(`/api/admin/reports/expenses-income?${params}`);
      if (res.ok) setExpensesIncome(await res.json());
    } catch (err) {
      console.error("Reports expenses-income fetch error:", err);
    }
  }

  async function fetchExpenseIncomeNames() {
    try {
      const res = await fetch("/api/admin/reports/expenses-income-names");
      if (res.ok) {
        const d = await res.json();
        setExpenseIncomeNames(d.names ?? []);
      }
    } catch {}
  }

  async function fetchSuppliersReport() {
    try {
      const res = await fetch(`/api/admin/reports/suppliers?from=${dateFrom}&to=${dateTo}`);
      if (res.ok) setSuppliersReport(await res.json());
    } catch {}
  }

  async function fetchDistribution() {
    try {
      const res = await fetch(`/api/admin/reports/distribution?from=${dateFrom}&to=${dateTo}`);
      if (res.ok) setDistributionReport(await res.json());
    } catch {
      setDistributionReport(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetchSummary().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === "summary") return;
    setTabLoading(true);
    const p =
      tab === "sales" ? fetchSales() :
      tab === "profit" ? fetchProfit() :
      tab === "inventory" ? fetchInventory() :
      tab === "workshop" ? fetchWorkshop() :
      tab === "distribution" ? fetchDistribution() :
      tab === "expenses" ? Promise.all([fetchExpenseIncomeNames(), fetchExpensesIncome()]) :
      fetchSuppliersReport();
    p.finally(() => setTabLoading(false));
  }, [tab, dateFrom, dateTo, expenseNameFilter, expenseTypeFilter, page]);

  const tabs = [
    { id: "summary" as Tab, label: "ملخص" },
    { id: "sales" as Tab, label: "المبيعات" },
    { id: "profit" as Tab, label: "الأرباح" },
    { id: "inventory" as Tab, label: "المخزون" },
    { id: "workshop" as Tab, label: "الورشة" },
    { id: "distribution" as Tab, label: "التوزيع والموزّعين" },
    { id: "expenses" as Tab, label: "المصروفات والإيرادات" },
    { id: "suppliers" as Tab, label: "مقارنة الموردين" },
  ];

  function handleExportExcel() {
    if (tab === "sales" && sales?.invoices) {
      const data = (sales.invoices as Array<{ created_at: string; invoice_number: string; type: string; customer_name: string | null; vehicle_plate: string | null; total: number }>).map((inv) => ({
        التاريخ: new Date(inv.created_at).toLocaleDateString("ar-EG"),
        "رقم الفاتورة": inv.invoice_number,
        النوع: inv.type === "maintenance" ? "صيانة" : "بيع",
        "العميل/اللوحة": inv.customer_name || inv.vehicle_plate || "—",
        الإجمالي: inv.total,
      }));
      exportToExcel(data, `مبيعات-${dateFrom}-${dateTo}`, "المبيعات");
    } else if (tab === "profit" && profit?.rows) {
      const data = (profit.rows as Array<{ created_at: string; invoice_number: string; type: string; item_name: string; quantity: number; sale_price: number; item_total: number; cost_total: number; profit: number }>).map((r) => ({
        التاريخ: new Date(r.created_at).toLocaleDateString("ar-EG"),
        "رقم الفاتورة": r.invoice_number,
        النوع: r.type === "maintenance" ? "صيانة" : "بيع",
        الصنف: r.item_name,
        الكمية: r.quantity,
        "سعر البيع": r.sale_price,
        "إجمالي البيع": r.item_total,
        "إجمالي التكلفة": r.cost_total,
        الربح: r.profit,
      }));
      exportToExcel(data, `أرباح-${dateFrom}-${dateTo}`, "الأرباح");
    } else if (tab === "inventory" && (inventory?.movements || inventory?.valuation)) {
      if (inventory?.valuation && (inventory.valuation as unknown[]).length > 0) {
        const data = (inventory.valuation as Array<{ name: string; quantity: number; purchase_price: number; value: number }>).map((v) => ({
          الصنف: v.name,
          الكمية: v.quantity,
          "سعر الشراء": v.purchase_price,
          القيمة: v.value,
        }));
        exportToExcel(data, `قيمة-مخزون-${dateFrom}-${dateTo}`, "قيمة المخزون");
      } else if (inventory?.movements) {
        const data = (inventory.movements as Array<{ item_name: string; quantity: number; movement_type: string; created_at: string }>).map((m) => ({
          التاريخ: new Date(m.created_at).toLocaleString("ar-EG"),
          الصنف: m.item_name,
          الكمية: m.quantity,
          النوع: MOVEMENT_LABELS[m.movement_type] || m.movement_type,
        }));
        exportToExcel(data, `حركة-مخزون-${dateFrom}-${dateTo}`, "حركة المخزون");
      }
    } else if (tab === "workshop" && workshop?.completed) {
      const data = (workshop.completed as Array<{ completed_at: string; order_number: string; vehicle_plate: string; total: number }>).map((o) => ({
        التاريخ: new Date(o.completed_at).toLocaleDateString("ar-EG"),
        "رقم الأمر": o.order_number,
        اللوحة: o.vehicle_plate,
        الإجمالي: o.total,
      }));
      exportToExcel(data, `ورشة-${dateFrom}-${dateTo}`, "الورشة");
    } else if (tab === "expenses" && expensesIncome?.rows) {
      (async () => {
        try {
          const params = new URLSearchParams({ from: dateFrom, to: dateTo, limit: "10000", offset: "0" });
          if (expenseNameFilter) params.set("name", expenseNameFilter);
          if (expenseTypeFilter) params.set("type", expenseTypeFilter);
          const res = await fetch(`/api/admin/reports/expenses-income?${params}`);
          const data = res.ok ? await res.json() : { rows: expensesIncome.rows };
          const rows = (data.rows ?? expensesIncome.rows) as Array<{ type: string; amount: number; item_name: string | null; description: string; treasury_name: string; created_at: string }>;
          const excelData = rows.map((r) => ({
            التاريخ: new Date(r.created_at).toLocaleString("ar-EG"),
            النوع: r.type === "expense" ? "مصروف" : "إيراد",
            الاسم: r.item_name || "—",
            المبلغ: r.amount,
            البيان: r.description || "—",
            الخزينة: r.treasury_name,
          }));
          exportToExcel(excelData, `مصروفات-إيرادات-${dateFrom}-${dateTo}`, "المصروفات والإيرادات");
        } catch {
          const fallback = (expensesIncome.rows as Array<{ type: string; amount: number; item_name: string | null; description: string; treasury_name: string; created_at: string }>).map((r) => ({
            التاريخ: new Date(r.created_at).toLocaleString("ar-EG"),
            النوع: r.type === "expense" ? "مصروف" : "إيراد",
            الاسم: r.item_name || "—",
            المبلغ: r.amount,
            البيان: r.description || "—",
            الخزينة: r.treasury_name,
          }));
          exportToExcel(fallback, `مصروفات-إيرادات-${dateFrom}-${dateTo}`, "المصروفات والإيرادات");
        }
      })();
    } else if (tab === "suppliers" && suppliersReport?.rows) {
      const data = (suppliersReport.rows as Array<{ supplier_name: string; invoice_count: number; total_quantity: number; total_amount: number; avg_price: number }>).map((r) => ({
        المورد: r.supplier_name,
        "عدد الفواتير": r.invoice_count,
        "إجمالي الكميات": r.total_quantity,
        "إجمالي المبالغ": r.total_amount,
        "متوسط السعر": r.avg_price.toFixed(2),
      }));
      exportToExcel(data, `مقارنة-موردين-${dateFrom}-${dateTo}`, "مقارنة الموردين");
    } else if (tab === "distribution" && distributionReport?.distributors && distributionReport.distributors.length > 0) {
      const data = distributionReport.distributors.map((d) => ({
        الموظف: d.user_name,
        "مخزن التوزيع": d.warehouse_name,
        "رصيد النقد عند الموزّع الآن": d.treasury_balance_now,
        "إجمالي وحدات المخزون بالمخزن": d.stock_quantity_total,
        "نقد دخل في الفترة": d.period_cash_in ?? "—",
        "تسليم للرئيسية في الفترة": d.period_settled_to_main ?? "—",
      }));
      exportToExcel(data, `توزيع-${dateFrom}-${dateTo}`, "التوزيع");
    } else {
      alert("لا توجد بيانات للتصدير");
    }
  }

  async function handleExportPdf() {
    const ids: Record<string, string> = {
      sales: "report-sales",
      profit: "report-profit",
      inventory: "report-inventory",
      workshop: "report-workshop",
      distribution: "report-distribution",
      expenses: "report-expenses",
      suppliers: "report-suppliers",
    };
    const id = ids[tab];
    if (!id) {
      alert("التصدير غير متاح لهذا التقرير");
      return;
    }
    try {
      await exportToPdf(id, `تقرير-${tab}-${dateFrom}-${dateTo}`);
    } catch (err) {
      alert(getErrorMessage(err, "فشل في تصدير PDF"));
    }
  }

  const s = summary as {
    sales?: { today?: { total: number; count: number }; week?: { total: number; count: number }; month?: { total: number; count: number } };
    workshop?: Record<string, number>;
    lowStockCount?: number;
    pendingInvoices?: { count: number; remaining: number };
  } | null;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabLoading && tab !== "summary" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-100 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">جاري تحميل التقرير...</p>
        </div>
      )}

      {(tab === "sales" || tab === "profit" || tab === "inventory" || tab === "workshop" || tab === "distribution" || tab === "expenses" || tab === "suppliers") && (
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            {[
              { label: "أسبوع", days: 7 },
              { label: "شهر", days: 30 },
              { label: "3 أشهر", days: 90 },
              { label: "سنة", days: 365 },
            ].map(({ label, days }) => (
              <button
                key={days}
                type="button"
                onClick={() => setDateRange(days)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 ml-2">من</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 dark:text-gray-400 ml-2">إلى</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 placeholder-gray-400"
            />
          </div>
          {(tab === "sales" || tab === "profit" || tab === "inventory" || tab === "workshop" || tab === "distribution" || tab === "expenses" || tab === "suppliers") && (
            <>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
              >
                تصدير Excel
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
              >
                تصدير PDF
              </button>
            </>
          )}
        </div>
      )}

      {tab === "summary" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">جاري التحميل...</div>
          ) : s ? (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">مبيعات اليوم</h3>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {Number(s.sales?.today?.total ?? 0).toFixed(2)} ج.م
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.sales?.today?.count ?? 0} فاتورة</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">مبيعات الأسبوع</h3>
                <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {Number(s.sales?.week?.total ?? 0).toFixed(2)} ج.م
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.sales?.week?.count ?? 0} فاتورة</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">مبيعات الشهر</h3>
                <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                  {Number(s.sales?.month?.total ?? 0).toFixed(2)} ج.م
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.sales?.month?.count ?? 0} فاتورة</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">تنبيهات</h3>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{s.lowStockCount ?? 0} صنف تحت الحد الأدنى</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {s.pendingInvoices?.count ?? 0} فاتورة معلقة — {Number(s.pendingInvoices?.remaining ?? 0).toFixed(2)} ج.م
                </p>
              </div>
              <div className="md:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">الورشة حسب المرحلة</h3>
                <div className="flex flex-wrap gap-3">
                  {s.workshop && Object.entries(s.workshop).map(([stage, cnt]) => (
                    <div key={stage} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <span className="text-gray-600 dark:text-gray-300">{STAGE_LABELS[stage] || stage}</span>
                      <span className="font-bold mr-2">{(cnt as number)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {tab === "sales" && !tabLoading && (
        <div id="report-sales" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">تقرير المبيعات</h2>
            {sales?.totals ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                الإجمالي: {Number((sales.totals as { total?: number })?.total ?? 0).toFixed(2)} ج.م — {(sales.totals as { count?: number })?.count ?? 0} فاتورة
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto max-h-96">
            {sales?.invoices && (sales.invoices as unknown[]).length > 0 ? (
              (() => {
                const salesFiltered = filterBySearch(
                  (sales.invoices as Array<{ id: string; invoice_number: string; type: string; customer_name: string | null; vehicle_plate: string | null; total: number; created_at: string }>),
                  (inv) => `${inv.invoice_number} ${inv.customer_name || ""} ${inv.vehicle_plate || ""} ${inv.type === "maintenance" ? "صيانة" : "بيع"}`
                );
                const salesPaginated = salesFiltered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
                return (
              <>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رقم الفاتورة</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">النوع</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">العميل / اللوحة</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {salesPaginated.map((inv) => (
                    <tr key={inv.invoice_number} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{new Date(inv.created_at).toLocaleDateString("ar-EG")}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/invoices/${inv.id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{inv.type === "maintenance" ? "صيانة" : "بيع"}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{inv.customer_name || inv.vehicle_plate || "—"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{inv.total?.toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls page={page} totalItems={salesFiltered.length} onPageChange={setPage} />
              </>
                );
              })()
            ) : (
              <div className="p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-2">لا توجد فواتير في الفترة المحددة</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">جرّب تغيير الفترة أو إزالة فلتر البحث</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "profit" && !tabLoading && (
        <div id="report-profit" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">تقرير الأرباح</h2>
            {profit?.summary ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                إجمالي المبيعات: {Number((profit.summary as { totalSales?: number })?.totalSales ?? 0).toFixed(2)} ج.م —
                التكلفة: {Number((profit.summary as { totalCost?: number })?.totalCost ?? 0).toFixed(2)} ج.م —
                الربح: <span className="font-medium text-emerald-600">{Number((profit.summary as { totalProfit?: number })?.totalProfit ?? 0).toFixed(2)} ج.م</span>
              </p>
            ) : null}
          </div>
          <div className="overflow-x-auto max-h-96">
            {profit?.rows && (profit.rows as unknown[]).length > 0 ? (
              (() => {
                const profitFiltered = filterBySearch(
                  (profit.rows as Array<{ invoice_number: string; item_name: string; quantity: number; sale_price: number; cost_total: number; profit: number; created_at: string }>),
                  (r) => `${r.invoice_number} ${r.item_name}`
                );
                const profitPaginated = profitFiltered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
                return (
              <>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الفاتورة</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الصنف</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الكمية</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">سعر البيع</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التكلفة</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الربح</th>
                  </tr>
                </thead>
                <tbody>
                  {profitPaginated.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{new Date(r.created_at).toLocaleDateString("ar-EG")}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.invoice_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.item_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.sale_price?.toFixed(2)} ج.م</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.cost_total?.toFixed(2)} ج.م</td>
                      <td className={`px-4 py-3 text-sm font-medium ${r.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {r.profit?.toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls page={page} totalItems={profitFiltered.length} onPageChange={setPage} />
              </>
                );
              })()
            ) : (
              <div className="p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-2">لا توجد بيانات في الفترة المحددة</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">جرّب تغيير الفترة أو إزالة فلتر البحث</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "inventory" && !tabLoading && (
        <div id="report-inventory" className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">قيمة المخزون الإجمالية</h3>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {Number(inventory?.totalValue ?? 0).toFixed(2)} ج.م
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">(كمية × سعر الشراء لكل صنف)</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-gray-100">أصناف تحت الحد الأدنى</h2>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {inventory?.lowStock && (inventory.lowStock as unknown[]).length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {filterBySearch(
                    (inventory.lowStock as Array<{ id: string; name: string; quantity: number; min_quantity: number }>),
                    (item) => item.name
                  ).map((item) => (
                    <li key={item.id} className="p-4 flex justify-between">
                      <Link href={`/admin/inventory/${item.id}`} className="text-emerald-600 hover:underline">
                        {item.name}
                      </Link>
                      <span className="text-amber-600 font-medium">{item.quantity} / {item.min_quantity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">لا توجد أصناف تحت الحد الأدنى</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">جميع الأصناف ضمن المستوى المطلوب</p>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-gray-100">آخر حركات المخزون</h2>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {inventory?.movements && (inventory.movements as unknown[]).length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {filterBySearch(
                    (inventory.movements as Array<{ id: string; item_name: string; quantity: number; movement_type: string; created_at: string }>),
                    (m) => `${m.item_name} ${MOVEMENT_LABELS[m.movement_type] || m.movement_type}`
                  ).map((m) => (
                    <li key={m.id} className="p-4 flex justify-between text-sm">
                      <span>{m.item_name}</span>
                      <span className={m.quantity < 0 ? "text-red-600" : "text-emerald-600"}>
                        {m.quantity > 0 ? "+" : ""}{m.quantity} — {MOVEMENT_LABELS[m.movement_type] || m.movement_type}
                      </span>
                      <span className="text-gray-500">{new Date(m.created_at).toLocaleString("ar-EG")}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">لا توجد حركات مخزون</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">في الفترة المحددة</p>
                </div>
              )}
            </div>
          </div>
          </div>
          {inventory?.valuation && Array.isArray(inventory.valuation) && (inventory.valuation as unknown[]).length > 0 ? (
            (() => {
              const valFiltered = filterBySearch(
                (inventory.valuation as Array<{ id: string; name: string; quantity: number; purchase_price: number; value: number }>),
                (v) => v.name
              );
              const valPaginated = valFiltered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
              return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="font-bold text-gray-900 dark:text-gray-100">تفاصيل قيمة المخزون</h2>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الصنف</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الكمية</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">سعر الشراء</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valPaginated.map((v) => (
                      <tr key={v.id} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="px-4 py-3 text-sm">
                          <Link href={`/admin/inventory/${v.id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">{v.name}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{v.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{v.purchase_price?.toFixed(2)} ج.م</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{v.value?.toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls page={page} totalItems={valFiltered.length} onPageChange={setPage} />
              </div>
            </div>
              );
            })()
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-gray-500 dark:text-gray-400">لا توجد أصناف في المخزون</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">أضف أصنافاً من المخزون أو فواتير الشراء</p>
            </div>
          )}
        </div>
      )}

      {tab === "distribution" && !tabLoading && (
        <div id="report-distribution" className="space-y-4">
          {distributionReport?.policy_note && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-100">
              {distributionReport.policy_note}
            </div>
          )}
          {distributionReport?.not_a_distributor ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-100 dark:border-gray-700 text-center text-gray-600 dark:text-gray-400">
              هذا التقرير للموظفين المسند لهم مخزن توزيع. يمكنك استخدام تبويبات أخرى.
            </div>
          ) : distributionReport?.distributors && distributionReport.distributors.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="font-bold text-gray-900 dark:text-gray-100">ملخص الموزّعين للفترة {dateFrom} — {dateTo}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  الأرقام بالفترة تعرض حركة النقد؛ رصيد النقد والمخزون هو الوضع الحالي (قد يشمل عملاً سابقاً — التسليم ليس يومياً).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الموظف</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">مخزن التوزيع</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رصيد النقد الآن</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">وحدات بالمخزن</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">نقد بالفترة</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">تسليم للرئيسية بالفترة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributionReport.distributors.map((d, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{d.user_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{d.warehouse_name}</td>
                        <td className="px-4 py-3 text-sm font-medium">{d.treasury_balance_now.toFixed(2)} ج.م</td>
                        <td className="px-4 py-3 text-sm">{d.stock_quantity_total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">
                          {d.period_cash_in != null ? `${d.period_cash_in.toFixed(2)} ج.م` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {d.period_settled_to_main != null ? `${d.period_settled_to_main.toFixed(2)} ج.م` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 border text-center text-gray-500 dark:text-gray-400">
              لا يوجد موزّعون بمخازن مسندة.
            </div>
          )}
        </div>
      )}

      {tab === "workshop" && !tabLoading && (
        <div id="report-workshop" className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">المراحل</h2>
            <div className="flex flex-wrap gap-3">
              {workshop?.byStage
                ? Object.entries(workshop.byStage as Record<string, number>).map(([stage, cnt]) => (
                    <div key={stage} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <span className="text-gray-600 dark:text-gray-300">{STAGE_LABELS[stage] || stage}</span>
                      <span className="font-bold mr-2">{cnt}</span>
                    </div>
                  ))
                : null}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-gray-100">أوامر مكتملة في الفترة</h2>
              {workshop?.completedTotal != null ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  الإجمالي: {Number(workshop.completedTotal).toFixed(2)} ج.م — {Number(workshop.completedCount ?? 0)} أمر
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto max-h-96">
              {workshop?.completed && (workshop.completed as unknown[]).length > 0 ? (
                (() => {
                  const workshopFiltered = filterBySearch(
                    (workshop.completed as Array<{ id: string; order_number: string; vehicle_plate: string; completed_at: string; total: number }>),
                    (o) => `${o.order_number} ${o.vehicle_plate}`
                  );
                  const workshopPaginated = workshopFiltered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
                  return (
                <>
                <table className="w-full">
                  <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رقم الأمر</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">اللوحة</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                    {workshopPaginated.map((o) => (
                      <tr key={o.id} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{new Date(o.completed_at).toLocaleDateString("ar-EG")}</td>
                        <td className="px-4 py-3">
                          <Link href={`/admin/workshop/${o.id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                            {o.order_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{o.vehicle_plate}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{o.total?.toFixed(2)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls page={page} totalItems={workshopFiltered.length} onPageChange={setPage} />
                </>
                  );
                })()
              ) : (
                <div className="p-12 text-center">
                  <p className="text-gray-500 dark:text-gray-400">لا توجد أوامر مكتملة في الفترة</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">جرّب تغيير الفترة</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "expenses" && !tabLoading && (
        <div id="report-expenses" className="space-y-6">
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">النوع:</label>
            <select
              value={expenseTypeFilter}
              onChange={(e) => setExpenseTypeFilter((e.target.value || "") as "" | "expense" | "income")}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm"
            >
              <option value="">كل المصروفات والإيرادات</option>
              <option value="expense">مصروف فقط</option>
              <option value="income">إيراد فقط</option>
            </select>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">الاسم:</label>
            <select
              value={expenseNameFilter}
              onChange={(e) => setExpenseNameFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm"
            >
              <option value="">كل الأسماء</option>
              {expenseIncomeNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إجمالي المصروفات</h3>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {Number(expensesIncome?.totalExpenses ?? 0).toFixed(2)} ج.م
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إجمالي الإيرادات</h3>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {Number(expensesIncome?.totalIncome ?? 0).toFixed(2)} ج.م
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الصافي</h3>
              <p className={`text-2xl font-bold ${Number(expensesIncome?.net ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {Number(expensesIncome?.net ?? 0).toFixed(2)} ج.م
              </p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-gray-100">تفاصيل المصروفات والإيرادات</h2>
            </div>
            <div className="overflow-x-auto max-h-96">
              {expensesIncome?.rows && (expensesIncome.rows as unknown[]).length > 0 ? (
                (() => {
                  const expRows = expensesIncome.rows as Array<{ id: string; type: string; amount: number; item_name: string | null; description: string; treasury_name: string; created_at: string }>;
                  const expTotal = Number(expensesIncome?.total ?? expRows.length);
                  return (
                <>
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">النوع</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الاسم</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">المبلغ</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">البيان</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الخزينة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expRows.map((r) => (
                      <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{new Date(r.created_at).toLocaleString("ar-EG")}</td>
                        <td className="px-4 py-3 text-sm">{r.type === "expense" ? "مصروف" : "إيراد"}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{r.item_name || "—"}</td>
                        <td className={`px-4 py-3 text-sm font-medium ${r.amount < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {r.amount.toFixed(2)} ج.م
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.description || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.treasury_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <PaginationControls page={page} totalItems={expTotal} onPageChange={setPage} />
                </>
                  );
                })()
              ) : (
                <div className="p-12 text-center">
                  <p className="text-gray-500 dark:text-gray-400">لا توجد مصروفات أو إيرادات في الفترة</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">جرّب تغيير الفترة أو إزالة فلتر البحث</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "suppliers" && !tabLoading && (
        <div id="report-suppliers" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">مقارنة الموردين (فواتير الشراء)</h2>
          </div>
          <div className="overflow-x-auto">
            {suppliersReport?.rows && (suppliersReport.rows as unknown[]).length > 0 ? (
              (() => {
                const supFiltered = filterBySearch(
                  (suppliersReport.rows as Array<{ supplier_name: string; invoice_count: number; total_quantity: number; total_amount: number; avg_price: number }>),
                  (r) => r.supplier_name
                );
                const supPaginated = supFiltered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);
                return (
              <>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">المورد</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">عدد الفواتير</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">إجمالي الكميات</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">إجمالي المبالغ</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">متوسط السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {supPaginated.map((r) => (
                    <tr key={r.supplier_name} className="border-b border-gray-50 dark:border-gray-700">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{r.supplier_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.invoice_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.total_quantity}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{r.total_amount.toFixed(2)} ج.م</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{r.avg_price.toFixed(2)} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationControls page={page} totalItems={supFiltered.length} onPageChange={setPage} />
              </>
                );
              })()
            ) : (
              <div className="p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400">لا توجد بيانات مشتريات في الفترة</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">سجّل فواتير شراء من الموردين أولاً</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
