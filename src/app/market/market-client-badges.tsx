"use client";

import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

const STORAGE_KEY = "efct-market-last-visit";

function emptySubscribe() {
  return () => {};
}

function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export type ListingMeta = { id: string; created_at: string; category: string };

function CountBadge({
  count,
  className = "",
  title,
}: {
  count: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${className}`}
      title={title}
      aria-label={title ?? String(count)}
    >
      {count}
    </span>
  );
}

export function MarketPageChrome({
  counts,
  listingMeta,
  tab,
  children,
}: {
  counts: { total: number; parts: number; workshop: number };
  listingMeta: ListingMeta[];
  tab: "parts" | "workshop";
  children: ReactNode;
}) {
  const isClient = useIsClient();

  const { newTotal, newParts, newWorkshop } = useMemo(() => {
    if (!isClient || typeof window === "undefined") {
      return { newTotal: 0, newParts: 0, newWorkshop: 0 };
    }
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return { newTotal: 0, newParts: 0, newWorkshop: 0 };
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) return { newTotal: 0, newParts: 0, newWorkshop: 0 };
    let nt = 0;
    let np = 0;
    let nw = 0;
    for (const m of listingMeta) {
      const ct = new Date(m.created_at).getTime();
      if (Number.isNaN(ct) || ct <= t) continue;
      nt++;
      if (m.category === "parts") np++;
      else if (m.category === "workshop") nw++;
    }
    return { newTotal: nt, newParts: np, newWorkshop: nw };
  }, [listingMeta, isClient]);

  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(STORAGE_KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100"
      dir="rtl"
    >
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-emerald-800 dark:text-emerald-400 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 flex-wrap">
                سوق
                <CountBadge
                  count={counts.total}
                  className={
                    counts.total > 0
                      ? "bg-emerald-600 text-white dark:bg-emerald-500"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }
                  title="إجمالي الإعلانات النشطة"
                />
                {isClient && newTotal > 0 && (
                  <CountBadge
                    count={newTotal}
                    className="bg-amber-500 text-white dark:bg-amber-600"
                    title="إعلانات جديدة منذ آخر زيارة لهذا الجهاز"
                  />
                )}
                <span className="text-emerald-800 dark:text-emerald-400">EFCT</span>
              </span>
            </h1>
            {isClient && newTotal > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                الرقم البرتقالي: جديد منذ آخر زيارة (يُحدَّث عند مغادرة الصفحة)
              </p>
            )}
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed">
              للشركات والمستخدمين المسجّلين — عرض إعلانات فقط؛ البيع والشراء مباشرة مع المورّد. المنصة لا تتدخل في المعاملات.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            لوحة التحكم
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-800 flex-wrap">
          <Link
            href="/market?tab=parts"
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === "parts"
                ? "bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-700 text-emerald-800 dark:text-emerald-400"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80"
            }`}
          >
            قطع غيار
            <CountBadge
              count={counts.parts}
              className={
                tab === "parts"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                  : counts.parts > 0
                    ? "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }
            />
            {isClient && newParts > 0 && (
              <CountBadge
                count={newParts}
                className="bg-amber-500 text-white text-[10px] min-w-[1.25rem] px-1.5"
                title="جديد في القسم"
              />
            )}
          </Link>
          <Link
            href="/market?tab=workshop"
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === "workshop"
                ? "bg-white dark:bg-gray-900 border border-b-0 border-gray-200 dark:border-gray-700 text-emerald-800 dark:text-emerald-400"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/80"
            }`}
          >
            مستلزمات ومعدات ورشة
            <CountBadge
              count={counts.workshop}
              className={
                tab === "workshop"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                  : counts.workshop > 0
                    ? "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }
            />
            {isClient && newWorkshop > 0 && (
              <CountBadge
                count={newWorkshop}
                className="bg-amber-500 text-white text-[10px] min-w-[1.25rem] px-1.5"
                title="جديد في القسم"
              />
            )}
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
