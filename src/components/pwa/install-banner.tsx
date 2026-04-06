"use client";

import { useState, useEffect } from "react";

export function PwaInstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    // لا تظهر إذا التطبيق مثبت (standalone)
    if (typeof window === "undefined") return;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    setIsIOS(ios);

    if (ios) {
      // iOS: إظهار التلميح بعد ثوانٍ (لا يوجد beforeinstallprompt)
      const timer = setTimeout(() => {
        const dismissed = sessionStorage.getItem("pwa-install-dismissed");
        if (!dismissed) setShow(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: انتظار beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as { prompt: () => Promise<void> });
      const dismissed = sessionStorage.getItem("pwa-install-dismissed");
      if (!dismissed) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setShow(false);
    }
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  const handleDismiss = () => {
    setShow(false);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-emerald-600 text-white shadow-lg safe-area-pb" dir="rtl">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">ثبّت التطبيق للوصول السريع</p>
          {isIOS ? (
            <p className="text-xs text-emerald-100 mt-0.5">
              اضغط مشاركة ← إضافة إلى الشاشة الرئيسية
            </p>
          ) : (
            <p className="text-xs text-emerald-100 mt-0.5">
              افتح التطبيق كتطبيق مستقل
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {!isIOS && deferredPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="px-4 py-2 bg-white text-emerald-600 font-medium rounded-lg text-sm hover:bg-emerald-50"
            >
              تثبيت
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-2 text-emerald-100 hover:text-white text-sm"
          >
            لاحقاً
          </button>
        </div>
      </div>
    </div>
  );
}
