"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Summary = {
  lowStockCount?: number;
  pendingInvoices?: { count: number; remaining: number };
};

export function AlertsBadge() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch("/api/admin/reports/summary");
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } catch {}
    }
    fetchSummary();
    const interval = setInterval(fetchSummary, 2 * 60 * 1000); // كل دقيقتين
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const lowCount = summary?.lowStockCount ?? 0;
  const pendingCount = summary?.pendingInvoices?.count ?? 0;
  const total = lowCount + pendingCount;

  if (total === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="التنبيهات"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
          {total > 9 ? "9+" : total}
        </span>
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-1 w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50 py-2">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">التنبيهات</h3>
          </div>
          {lowCount > 0 && (
            <Link
              href="/admin/inventory"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                📦
              </span>
              <div>
                <p className="font-medium text-sm">{lowCount} صنف تحت الحد الأدنى</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">عرض المخزون</p>
              </div>
            </Link>
          )}
          {pendingCount > 0 && (
            <Link
              href="/admin/invoices?status=pending"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                📄
              </span>
              <div>
                <p className="font-medium text-sm">{pendingCount} فاتورة معلقة</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {Number(summary?.pendingInvoices?.remaining ?? 0).toLocaleString("ar-EG")} ج.م
                </p>
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
