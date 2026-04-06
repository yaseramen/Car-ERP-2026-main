"use client";

import { HeroPhotoStack } from "./hero-photo-stack";

/**
 * خلفية ثابتة بملء الشاشة للصفحة الرئيسية العامة ومجموعة (auth).
 * نفس مصادر الصورة: متغير البيئة → ملف الترويج → SVG المدمج.
 */
export function MarketingPageBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <HeroPhotoStack className="h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/55" />
    </div>
  );
}
