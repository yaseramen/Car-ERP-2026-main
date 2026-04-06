"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-950 antialiased">
        <div className="max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            حدث خطأ
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            حدث خطأ أثناء تحميل التطبيق. جرب إعادة المحاولة أو العودة لتسجيل الدخول.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
            نصيحة: إذا ظهر الخطأ عند فتح الرابط من فيسبوك أو إنستغرام، افتح الموقع من المتصفح العادي (Chrome أو Safari).
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
            >
              إعادة المحاولة
            </button>
            <a
              href="/login"
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-medium rounded-lg transition-colors text-center"
            >
              العودة لتسجيل الدخول
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
