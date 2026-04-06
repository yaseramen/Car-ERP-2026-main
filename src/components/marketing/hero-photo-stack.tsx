"use client";

import { useMemo, useState } from "react";
import { buildMarketingHeroSrcList, HERO_SVG_FALLBACK_PATH } from "@/lib/marketing-hero-assets";

type Props = {
  className?: string;
};

/** رابط بيئة اختياري ثم SVG المدمج — بدون طلب ملفات غير موجودة */
export function HeroPhotoStack({ className = "" }: Props) {
  const candidates = useMemo(() => buildMarketingHeroSrcList(), []);
  const [index, setIndex] = useState(0);
  const src = candidates[index] ?? HERO_SVG_FALLBACK_PATH;

  return (
    <img
      key={src}
      src={src}
      alt=""
      className={className}
      decoding="async"
      fetchPriority="high"
      onError={() => {
        setIndex((i) => Math.min(i + 1, candidates.length - 1));
      }}
    />
  );
}
