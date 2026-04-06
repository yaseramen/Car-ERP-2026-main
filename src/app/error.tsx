"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-950" dir="rtl">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          حدث خطأ
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          حدث خطأ أثناء تحميل الصفحة. جرب إعادة المحاولة أو العودة لتسجيل الدخول.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
          نصيحة: إذا ظهر الخطأ عند فتح الرابط من فيسبوك أو إنستغرام، افتح الموقع من المتصفح العادي (Chrome أو Safari).
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
          >
            إعادة المحاولة
          </button>
          <Link
            href="/login"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-medium rounded-lg transition-colors"
          >
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
}
