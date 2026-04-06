"use client";

import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (category: string) => void;
  className?: string;
  id?: string;
  label?: string;
  /** إن وُجدت تُستخدم مباشرة دون طلب إضافي */
  categories?: string[];
  /** عند التفعيل يُحمَّل القائمة من الخادم (إذا لم تُمرَّر `categories`) */
  loadOnMount?: boolean;
};

export function InventoryCategoryFilter({
  value,
  onChange,
  className = "",
  id = "inventory-category-filter",
  label = "القسم",
  categories: categoriesProp,
  loadOnMount = false,
}: Props) {
  const [fetchedCategories, setFetchedCategories] = useState<string[]>([]);
  const categories = categoriesProp ?? fetchedCategories;

  useEffect(() => {
    if (categoriesProp || !loadOnMount) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/inventory/categories");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setFetchedCategories(data.categories || []);
      } catch {
        if (!cancelled) setFetchedCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadOnMount, categoriesProp]);

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
      >
        <option value="">كل الأقسام</option>
        <option value="__uncategorized__">بدون قسم</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
