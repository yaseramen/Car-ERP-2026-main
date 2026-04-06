"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function MarketplaceExpiryBanner() {
  const [items, setItems] = useState<{ id: string; title_ar: string; ends_at: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/marketplace/alerts")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.expiringSoon) ? d.expiringSoon : []))
      .catch(() => setItems([]));
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="no-print shrink-0 px-3 py-2 text-sm border-b border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100"
      dir="rtl"
    >
      <span className="font-medium">تنبيه سوق:</span>{" "}
      {items.length === 1
        ? `إعلان «${items[0].title_ar}» ينتهي خلال 48 ساعة.`
        : `${items.length} إعلانات تنتهي خلال 48 ساعة.`}{" "}
      <Link href="/admin/marketplace" className="underline font-medium">
        التجديد أو الإعدادات
      </Link>
    </div>
  );
}
