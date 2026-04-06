"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getQueue } from "@/lib/offline-queue";

/**
 * شريط ثابت يوضح حالة الشبكة وعدد العمليات المعلّقة — يظهر في لوحة التحكم فقط.
 */
export function OfflineStatusBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    setOnline(navigator.onLine);
    setPending(getQueue().length);
  }, []);

  useEffect(() => {
    refresh();
    const onQueue = () => refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("alameen-queue-changed", onQueue);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("alameen-queue-changed", onQueue);
    };
  }, [refresh]);

  if (online && pending === 0) return null;

  return (
    <div
      className={`no-print shrink-0 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2 border-b ${
        online
          ? "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100"
          : "bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100"
      }`}
      role="status"
      dir="rtl"
    >
      <span className="font-medium">
        {!online ? (
          <>
            لا يوجد اتصال بالإنترنت — يمكنك متابعة العمل في الشاشات المفتوحة؛ العمليات تُحفظ محلياً وتُرسل عند عودة الشبكة.
          </>
        ) : (
          <>
            متصل — يوجد {pending} عملية معلّقة في انتظار الإرسال.
          </>
        )}
      </span>
      <div className="flex items-center gap-3 text-xs sm:text-sm">
        {pending > 0 && (
          <span className="tabular-nums opacity-90">
            الطابور: {pending}
          </span>
        )}
        <Link href="/admin/help" className="underline underline-offset-2 hover:opacity-80 whitespace-nowrap">
          نصائح الاستخدام
        </Link>
      </div>
    </div>
  );
}
