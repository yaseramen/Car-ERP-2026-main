"use client";

import type { ReactNode } from "react";

const SECTION_X = "px-4 sm:px-6 md:px-10 lg:px-12";

/** قسم الهيرو — الخلفية من MarketingPageBackdrop. النص داخل إطار أبيض شبه معتم لقراءة أوضح على الصورة. */
export function MarketingHeroSection({ children }: { children: ReactNode }) {
  return (
    <section
      className={`relative z-10 min-h-[100dvh] flex flex-col justify-center py-14 sm:py-20 md:py-20 lg:py-24 ${SECTION_X}`}
    >
      <div className="max-w-3xl sm:max-w-4xl md:max-w-5xl mx-auto w-full">
        <div className="rounded-2xl border border-gray-200/90 bg-white/95 dark:border-gray-600 dark:bg-gray-900/95 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.15)] px-5 py-8 sm:px-8 sm:py-10 md:px-10 md:py-11 text-center text-gray-900 dark:text-gray-100 [&_h1]:text-gray-900 dark:[&_h1]:text-white [&_strong]:text-gray-900 dark:[&_strong]:text-white [&_p]:text-gray-800 dark:[&_p]:text-gray-200 [&_.hero-subtext]:text-gray-600 dark:[&_.hero-subtext]:text-gray-300">
          {children}
        </div>
      </div>
    </section>
  );
}
