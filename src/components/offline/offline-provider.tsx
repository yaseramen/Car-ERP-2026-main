"use client";

import { useState, useEffect, useCallback } from "react";
import { processQueue, executeQueuedOpDefault, getQueue } from "@/lib/offline-queue";

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [banner, setBanner] = useState<"none" | "offline" | "online">("none");

  const syncQueueIfOnline = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = getQueue().length;
    if (pending === 0) return;
    const { processed, failed } = await processQueue(executeQueuedOpDefault);
    if (processed > 0) {
      const msg =
        failed > 0
          ? `تم إرسال ${processed} عملية. فشل ${failed} عملية — راجع الاتصال وحاول لاحقاً.`
          : `تم إرسال ${processed} عملية معلقة بنجاح.`;
      window.setTimeout(() => alert(msg), 300);
    }
    window.dispatchEvent(new CustomEvent("alameen-online"));
  }, []);

  useEffect(() => {
    if (!navigator.onLine) {
      setBanner("offline");
    }

    const handleOnline = async () => {
      setBanner("online");
      await syncQueueIfOnline();
      window.setTimeout(() => setBanner("none"), 8000);
    };

    const handleOffline = () => {
      setBanner("offline");
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void syncQueueIfOnline();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncQueueIfOnline]);

  return (
    <>
      {children}
      {banner !== "none" && (
        <div
          className={`fixed bottom-4 left-4 right-4 z-[100] rounded-lg px-4 py-3 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            banner === "online" ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
          }`}
          role="alert"
          dir="rtl"
        >
          {banner === "online" ? (
            <>
              <span>تم استعادة الاتصال. جاري تحديث البيانات… يمكنك الضغط على «تحديث الصفحة» إن لم تظهر أحدث الأرقام.</span>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm font-medium"
                >
                  تحديث الصفحة
                </button>
                <button
                  type="button"
                  onClick={() => setBanner("none")}
                  className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded text-sm"
                >
                  إخفاء
                </button>
              </div>
            </>
          ) : (
            <>
              <span>
                أنت غير متصل بالإنترنت. الشاشات المفتوحة تعمل بآخر بيانات؛ يمكن حفظ العمليات لتُرسل تلقائياً عند عودة الشبكة. تجنّب فتح صفحات جديدة حتى يعود الاتصال.
              </span>
              <button
                type="button"
                onClick={() => setBanner("none")}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm self-end sm:self-auto"
              >
                إخفاء
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
