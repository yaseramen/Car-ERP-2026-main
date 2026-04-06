"use client";

import { useState, useEffect } from "react";

const DISMISS_KEY = "alameen-inapp-dismissed";

export function InAppBrowserBanner() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const ua = navigator.userAgent || "";
      const isInApp = /FBAN|FBAV|FB_IAB|FB4A|FBIOS|Instagram/i.test(ua);
      if (!isInApp) return;
      const dismissed = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(DISMISS_KEY) : null;
      if (dismissed) return;
      setShow(true);
      document.body.style.paddingTop = "52px";
    } catch {
      // لا يعرض في حال أي خطأ
    }
    return () => {
      document.body.style.paddingTop = "";
    };
  }, []);

  useEffect(() => {
    if (!show) document.body.style.paddingTop = "";
  }, [show]);

  function dismiss() {
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1");
      document.body.style.paddingTop = "";
    } catch {}
    setShow(false);
  }

  function copyLink() {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!show) return null;

  const currentUrl = typeof window !== "undefined" ? window.location.href : "/";

  return (
    <div
      className="no-print fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
      role="banner"
    >
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-center sm:justify-between gap-2">
        <p className="text-sm font-medium text-center sm:text-right flex-1 min-w-0">
          لأفضل تجربة، افتح في Chrome أو Safari
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors"
          >
            {copied ? "تم ✓" : "نسخ"}
          </button>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors"
          >
            فتح في المتصفح
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="إغلاق"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
