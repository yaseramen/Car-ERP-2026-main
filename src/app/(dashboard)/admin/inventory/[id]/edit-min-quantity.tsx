"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EditMinQuantityProps {
  itemId: string;
  currentMin: number;
}

export function EditMinQuantity({ itemId, currentMin }: EditMinQuantityProps) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(currentMin > 0);
  const [value, setValue] = useState(currentMin > 0 ? String(currentMin) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/inventory/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          min_quantity_enabled: enabled,
          min_quantity: enabled ? Number(value) || 0 : 0,
        }),
      });
      if (res.ok) router.refresh();
      else alert("فشل في الحفظ");
    } catch {
      alert("حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-sm text-gray-600">تفعيل تنبيه الحد الأدنى</span>
      </label>
      {enabled && (
        <>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-900 text-sm"
            placeholder="0"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {saving ? "..." : "حفظ"}
          </button>
        </>
      )}
    </div>
  );
}
