"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const DASHBOARD_SECTIONS = ["superStats", "platformRevenue", "alerts", "backup", "sales", "treasuries", "workshop", "inventory", "chart"] as const;
const STORAGE_KEY = "alameen-dashboard-hidden";

type Summary = {
  canSee?: { sales: boolean; treasuries: boolean; workshop: boolean; inventory: boolean };
  sales: { today: { total: number; count: number }; week: { total: number; count: number }; month: { total: number; count: number } };
  workshop: Record<string, number>;
  lowStockCount: number;
  pendingInvoices: { count: number; remaining: number };
  treasuries: Record<string, number>;
  dailySales: { day: string; total: number }[];
};

const STAGE_LABELS: Record<string, string> = {
  received: "مستلمة",
  inspection: "فحص",
  maintenance: "صيانة",
  ready: "جاهزة",
  completed: "مكتمل",
};

const TREASURY_LABELS: Record<string, string> = {
  sales: "خزينة المبيعات",
  workshop: "خزينة الورشة",
  main: "الخزينة الرئيسية",
};

const BACKUP_REMINDER_DAYS = 7;

type SuperStats = {
  totalCompanies: number;
  activeCompanies: number;
  newThisMonth: number;
  target: number;
  alertLevel: "none" | "warn" | "alert" | "target";
};

type CompanyUsage = {
  id: string;
  name: string;
  business_type?: string;
  created_at: string;
  last_activity: string | null;
  days_since_activity: number | null;
  status: "active" | "inactive";
  invoice_count: number;
  customer_count: number;
  user_count: number;
};

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type PlatformRevenueData = {
  total: number;
  by_company: { company_id: string; company_name: string; revenue: number }[];
  breakdown: { digital_service: number; obd_search: number };
  note?: string;
};

export function DashboardContent({
  isSuperAdmin = false,
  isTenantOwner = false,
}: {
  isSuperAdmin?: boolean;
  isTenantOwner?: boolean;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [superStats, setSuperStats] = useState<SuperStats | null>(null);
  const [companiesUsage, setCompaniesUsage] = useState<{ rows: CompanyUsage[]; total: number } | null>(null);
  const [usageFilter, setUsageFilter] = useState<"all" | "active" | "inactive">("all");
  const [usagePage, setUsagePage] = useState(1);

  const [revFrom, setRevFrom] = useState(() => {
    const n = new Date();
    return formatYMD(new Date(n.getFullYear(), n.getMonth(), 1));
  });
  const [revTo, setRevTo] = useState(() => formatYMD(new Date()));
  const [platformRevenue, setPlatformRevenue] = useState<PlatformRevenueData | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  /** Snapshot at mount for backup-age math (avoids Date.now() during render for eslint purity). */
  const [dashboardClockMs] = useState(() => Date.now());

  useEffect(() => {
    try {
      setLastBackup(localStorage.getItem("alameen-last-backup"));
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHiddenSections(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  function toggleSection(id: string) {
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  const needsBackupReminder = (() => {
    if (!lastBackup) return true;
    const diff = (dashboardClockMs - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= BACKUP_REMINDER_DAYS;
  })();

  useEffect(() => {
    fetch("/api/admin/reports/summary")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/admin/super/stats")
      .then((r) => r.json())
      .then(setSuperStats)
      .catch(() => setSuperStats(null));
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const offset = (usagePage - 1) * 20;
    fetch(`/api/admin/super/companies-usage?limit=20&offset=${offset}&filter=${usageFilter}`)
      .then((r) => r.json())
      .then((d) => setCompaniesUsage({ rows: d.rows ?? [], total: d.total ?? 0 }))
      .catch(() => setCompaniesUsage(null));
  }, [isSuperAdmin, usagePage, usageFilter]);

  useEffect(() => {
    if (!isSuperAdmin || hiddenSections.has("platformRevenue")) return;
    setRevLoading(true);
    const q = new URLSearchParams({ from: revFrom, to: revTo });
    fetch(`/api/admin/super/platform-revenue?${q}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setPlatformRevenue(null);
        else setPlatformRevenue(d);
      })
      .catch(() => setPlatformRevenue(null))
      .finally(() => setRevLoading(false));
  }, [isSuperAdmin, revFrom, revTo, hiddenSections]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-gray-500 dark:text-gray-400">
        تعذر تحميل البيانات
      </div>
    );
  }

  const maxDaily = data.dailySales.length > 0 ? Math.max(...data.dailySales.map((d) => d.total), 1) : 1;
  const c = data.canSee ?? { sales: true, treasuries: true, workshop: true, inventory: true };
  const hasAny = c.sales || c.treasuries || c.workshop || c.inventory;
  const hasAlerts = (c.inventory && data.lowStockCount > 0) || (c.sales && data.pendingInvoices.count > 0);

  if (!hasAny) {
    return (
      <div className="py-20 text-center text-gray-500 dark:text-gray-400">
        <p>لا توجد صلاحيات لعرض لوحة التحكم.</p>
        <p className="text-sm mt-2">تواصل مع مديرك لإعطائك الصلاحيات المناسبة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <details className="relative">
          <summary className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
            تخصيص العرض
          </summary>
          <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-10 min-w-[180px]">
            {DASHBOARD_SECTIONS.map((id) => (
              <label key={id} className="flex items-center gap-2 cursor-pointer py-1 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!hiddenSections.has(id)}
                  onChange={() => toggleSection(id)}
                  className="rounded"
                />
                {id === "superStats" && "إحصائيات الشركات (Super Admin)"}
                {id === "platformRevenue" && "إيرادات المنصة (Super Admin)"}
                {id === "alerts" && "التنبيهات"}
                {id === "backup" && "تذكير النسخ الاحتياطي"}
                {id === "sales" && "المبيعات"}
                {id === "treasuries" && "الخزائن"}
                {id === "workshop" && "الورشة"}
                {id === "inventory" && "المخزون"}
                {id === "chart" && "رسم المبيعات"}
              </label>
            ))}
          </div>
        </details>
      </div>
      {isSuperAdmin && superStats && !hiddenSections.has("superStats") && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">الشركات النشطة</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{superStats.activeCompanies}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">من أصل {superStats.target} (هدف الترقية)</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">إجمالي الشركات</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{superStats.totalCompanies}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">جديد هذا الشهر</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{superStats.newThisMonth}</p>
            </div>
            {superStats.alertLevel !== "none" && (
              <div
                className={`rounded-xl p-5 border ${
                  superStats.alertLevel === "target"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800"
                    : superStats.alertLevel === "alert"
                      ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800"
                      : "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800"
                }`}
              >
                <p className="text-sm font-medium">
                  {superStats.alertLevel === "target" && "✓ وصلت للهدف — يمكن ترقية الخطة"}
                  {superStats.alertLevel === "alert" && `⚠ تنبيه: ${superStats.activeCompanies}/${superStats.target} — قريب من الحد`}
                  {superStats.alertLevel === "warn" && `تنبيه: ${superStats.activeCompanies}/${superStats.target} شركة`}
                </p>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">استخدام الشركات — النشطة مقابل الخاملة</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              الشركة <strong>نشطة</strong> إذا كان لها فاتورة أو دخول خلال آخر 30 يوم. <strong>خاملة</strong> = لا استخدام منذ 30+ يوم.
            </p>
            <div className="flex gap-2 mb-4">
              {(["all", "active", "inactive"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { setUsageFilter(f); setUsagePage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    usageFilter === f
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {f === "all" && "الكل"}
                  {f === "active" && "نشطة"}
                  {f === "inactive" && "خاملة"}
                </button>
              ))}
            </div>
            {companiesUsage && (
              <>
                <div className="overflow-x-auto max-h-80">
                  {companiesUsage.rows.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 text-sm py-6 text-center">لا توجد شركات تطابق الفلتر</p>
                  ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                        <th className="text-right px-3 py-2">الشركة</th>
                        <th className="text-right px-3 py-2">النشاط</th>
                        <th className="text-right px-3 py-2">الحالة</th>
                        <th className="text-right px-3 py-2">آخر نشاط</th>
                        <th className="text-right px-3 py-2">فواتير</th>
                        <th className="text-right px-3 py-2">عملاء</th>
                        <th className="text-right px-3 py-2">مستخدمون</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companiesUsage.rows.map((c) => (
                        <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                          <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {c.business_type === "supplier"
                              ? "مورّد"
                              : c.business_type === "sales_only"
                                ? "قطع غيار"
                                : c.business_type === "service_only"
                                  ? "خدمة"
                                  : "مختلط"}
                          </td>
                          <td className="px-3 py-2">
                            <span className={c.status === "active" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                              {c.status === "active" ? "نشطة" : "خاملة"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                            {c.last_activity ? (c.days_since_activity != null ? `منذ ${c.days_since_activity} يوم` : "—") : "لم يبدأ"}
                          </td>
                          <td className="px-3 py-2">{c.invoice_count}</td>
                          <td className="px-3 py-2">{c.customer_count}</td>
                          <td className="px-3 py-2">{c.user_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )}
                </div>
                {companiesUsage.total > 20 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setUsagePage((p) => Math.max(1, p - 1))}
                      disabled={usagePage <= 1}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
                    >
                      السابق
                    </button>
                    <span className="text-sm text-gray-500">
                      {usagePage} من {Math.ceil(companiesUsage.total / 20)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUsagePage((p) => p + 1)}
                      disabled={usagePage >= Math.ceil(companiesUsage.total / 20)}
                      className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
                    >
                      التالي
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {isSuperAdmin && !hiddenSections.has("platformRevenue") && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">إيرادات المنصة (رسوم الخدمة + OBD)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            مجموع ما يُخصم من محافظ <strong>الشركات العملاء</strong> فقط (يُستثنى حساب النظام التجريبي). للمقارنة مع سجل «آخر المعاملات»: القديم يُظهر السوبر أدمن كمنفّذ؛
            الإيرادات هنا تُحسب من الشركات الحقيقية فقط.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => {
                const t = new Date();
                setRevFrom(formatYMD(t));
                setRevTo(formatYMD(t));
              }}
            >
              اليوم
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => {
                const t = new Date();
                const start = new Date(t);
                start.setDate(t.getDate() - 6);
                setRevFrom(formatYMD(start));
                setRevTo(formatYMD(t));
              }}
            >
              آخر 7 أيام
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => {
                const t = new Date();
                const start = new Date(t.getFullYear(), t.getMonth(), 1);
                setRevFrom(formatYMD(start));
                setRevTo(formatYMD(t));
              }}
            >
              هذا الشهر
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => {
                const t = new Date();
                const start = new Date(t);
                start.setDate(t.getDate() - 29);
                setRevFrom(formatYMD(start));
                setRevTo(formatYMD(t));
              }}
            >
              آخر 30 يوماً
            </button>
          </div>
          <div className="flex flex-wrap gap-3 items-end mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">من</label>
              <input
                type="date"
                value={revFrom}
                onChange={(e) => setRevFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">إلى</label>
              <input
                type="date"
                value={revTo}
                onChange={(e) => setRevTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
              />
            </div>
          </div>
          {revLoading ? (
            <p className="text-gray-500 text-sm py-4">جاري التحميل...</p>
          ) : platformRevenue ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className="text-sm text-gray-500">الإجمالي في الفترة</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {platformRevenue.total.toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">خدمة رقمية</p>
                  <p className="text-lg font-semibold">{platformRevenue.breakdown.digital_service.toFixed(2)} ج.م</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">OBD</p>
                  <p className="text-lg font-semibold">{platformRevenue.breakdown.obd_search.toFixed(2)} ج.م</p>
                </div>
              </div>
              {platformRevenue.by_company.length > 0 ? (
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                        <th className="text-right px-3 py-2">الشركة</th>
                        <th className="text-right px-3 py-2">الإيراد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformRevenue.by_company.map((r) => (
                        <tr key={r.company_id} className="border-b border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-2">{r.company_name}</td>
                          <td className="px-3 py-2 font-medium">{r.revenue.toFixed(2)} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد معاملات إيراد في هذه الفترة.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">تعذر تحميل البيانات</p>
          )}
        </div>
      )}
      {hasAlerts && !hiddenSections.has("alerts") && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4 flex items-center gap-4">
          <span className="text-2xl">🔔</span>
          <div className="flex-1">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {c.inventory && data.lowStockCount > 0 && `${data.lowStockCount} صنف تحت الحد الأدنى`}
              {c.inventory && data.lowStockCount > 0 && c.sales && data.pendingInvoices.count > 0 && " • "}
              {c.sales && data.pendingInvoices.count > 0 && `${data.pendingInvoices.count} فاتورة معلقة`}
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              <Link href="/admin/inventory" className="hover:underline">{c.inventory && data.lowStockCount > 0 ? "عرض المخزون" : ""}</Link>
              {c.inventory && data.lowStockCount > 0 && c.sales && data.pendingInvoices.count > 0 && " | "}
              <Link href="/admin/invoices?status=pending" className="hover:underline">{c.sales && data.pendingInvoices.count > 0 ? "عرض الفواتير المعلقة" : ""}</Link>
            </p>
          </div>
        </div>
      )}
      {needsBackupReminder && !hiddenSections.has("backup") && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-amber-800 dark:text-amber-200 text-sm">
            {lastBackup ? `لم تقم بنسخ احتياطي منذ ${Math.floor((dashboardClockMs - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24))} يوم.` : "لم تقم بنسخ احتياطي بعد."} يُنصح بعمل نسخة احتياطية دورياً.
          </p>
          <Link
            href="/admin/settings"
            className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium"
          >
            نسخ احتياطي
          </Link>
        </div>
      )}
      {c.sales && !hiddenSections.has("sales") && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-5 border border-emerald-100 dark:border-emerald-800">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">مبيعات اليوم</p>
            <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 mt-1">
              {data.sales.today.total.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{data.sales.today.count} فاتورة</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-5 border border-blue-100 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">مبيعات الأسبوع</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
              {data.sales.week.total.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{data.sales.week.count} فاتورة</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-5 border border-amber-100 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300">مبيعات الشهر</p>
            <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
              {data.sales.month.total.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{data.sales.month.count} فاتورة</p>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/30 rounded-xl p-5 border border-violet-100 dark:border-violet-800">
            <p className="text-sm text-violet-700 dark:text-violet-300">فواتير معلقة</p>
            <p className="text-2xl font-bold text-violet-900 dark:text-violet-100 mt-1">
              {data.pendingInvoices.remaining.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">{data.pendingInvoices.count} فاتورة</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {c.treasuries && !hiddenSections.has("treasuries") && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">الخزائن</h3>
          <div className="space-y-3">
            {Object.entries(data.treasuries).map(([type, balance]) => (
              <div key={type} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="text-gray-700 dark:text-gray-300">{TREASURY_LABELS[type] || type}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{balance.toLocaleString("ar-EG")} ج.م</span>
              </div>
            ))}
          </div>
          <Link
            href="/admin/treasuries"
            className="mt-4 inline-block text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            عرض الخزائن →
          </Link>
        </div>
        )}

        {c.workshop && !hiddenSections.has("workshop") && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">الورشة</h3>
          <div className="space-y-2">
            {Object.entries(data.workshop).map(([stage, count]) => (
              <div key={stage} className="flex justify-between items-center">
                <span className="text-gray-700 dark:text-gray-300">{STAGE_LABELS[stage] || stage}</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{count}</span>
              </div>
            ))}
          </div>
          <Link
            href="/admin/workshop"
            className="mt-4 inline-block text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            عرض الورشة →
          </Link>
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {c.sales && !hiddenSections.has("chart") && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">مبيعات آخر 7 أيام</h3>
          <div className="flex gap-2 h-36">
            {data.dailySales.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">لا توجد بيانات</p>
            ) : (
              data.dailySales.map((d) => (
                <div key={d.day} className="flex-1 flex flex-col justify-end items-center gap-1 min-w-0">
                  <div
                    className="w-full bg-emerald-500 rounded-t min-h-[2px] transition-all"
                    style={{ height: `${Math.max(2, (d.total / maxDaily) * 100)}%` }}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full text-center">
                    {d.day.slice(5)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        )}

        {!hiddenSections.has("inventory") && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">تنبيهات</h3>
          <div className="space-y-2">
            {c.inventory && data.lowStockCount > 0 && (
              <Link
                href="/admin/inventory"
                className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition"
              >
                <span className="text-amber-600 dark:text-amber-400 font-medium">⚠️ أصناف ناقصة</span>
                <span className="text-amber-800 dark:text-amber-200 font-bold">{data.lowStockCount}</span>
              </Link>
            )}
            {c.sales && data.pendingInvoices.count > 0 && (
              <Link
                href="/admin/invoices"
                className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/30 border border-violet-100 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition"
              >
                <span className="text-violet-600 dark:text-violet-400 font-medium">فواتير معلقة</span>
                <span className="text-violet-800 dark:text-violet-200 font-bold">{data.pendingInvoices.count}</span>
              </Link>
            )}
            {(!c.inventory || data.lowStockCount === 0) && (!c.sales || data.pendingInvoices.count === 0) && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">لا توجد تنبيهات</p>
            )}
          </div>
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link
          href="/admin/cashier"
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-600 transition block"
        >
          <h3 className="font-medium text-gray-900 dark:text-gray-100">الكاشير</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">نقطة البيع والمبيعات</p>
        </Link>
        <Link
          href="/admin/inventory"
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-600 transition block"
        >
          <h3 className="font-medium text-gray-900 dark:text-gray-100">المخزن</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">إدارة الأصناف والمخزون</p>
        </Link>
        <Link
          href="/admin/workshop"
          className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-600 transition block"
        >
          <h3 className="font-medium text-gray-900 dark:text-gray-100">الورشة</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">أوامر الإصلاح والصيانة</p>
        </Link>
        {(isSuperAdmin || isTenantOwner) && (
          <Link
            href="/admin/wallets"
            className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-600 transition block"
          >
            <h3 className="font-medium text-gray-900 dark:text-gray-100">المحافظ</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              {isSuperAdmin ? "شحن محافظ الشركات" : "رصيد محفظتك وسجل العمليات"}
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
