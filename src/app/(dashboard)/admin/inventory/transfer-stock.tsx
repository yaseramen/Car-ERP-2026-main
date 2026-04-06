"use client";

import { useState, useEffect } from "react";
import { addToQueue } from "@/lib/offline-queue";
import { getErrorMessage } from "@/lib/error-messages";
import { InventoryCategoryFilter } from "@/components/inventory/inventory-category-filter";

interface Warehouse {
  id: string;
  name: string;
  type: string;
}

interface Item {
  id: string;
  name: string;
  quantity: number;
  category?: string | null;
  code?: string | null;
  barcode?: string | null;
}

type TransferStockProps = {
  distributionMode?: boolean;
  assignedWarehouseId?: string | null;
  assignedWarehouseName?: string | null;
  mainWarehouseId?: string | null;
};

export function TransferStock({
  distributionMode = false,
  assignedWarehouseId = null,
  assignedWarehouseName = null,
  mainWarehouseId = null,
}: TransferStockProps) {
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [itemId, setItemId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [availableQty, setAvailableQty] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [addingWarehouse, setAddingWarehouse] = useState(false);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [itemCategoryFilter, setItemCategoryFilter] = useState("");

  useEffect(() => {
    if (open) {
      setLoadingWarehouses(true);
      const itemsUrl = `/api/admin/inventory/items?limit=500&offset=0${itemCategoryFilter ? `&category=${encodeURIComponent(itemCategoryFilter)}` : ""}`;
      Promise.all([
        fetch("/api/admin/warehouses").then((r) => (r.ok ? r.json() : [])),
        fetch(itemsUrl).then((r) => (r.ok ? r.json() : [])),
      ])
        .then(([wh, it]) => {
          setWarehouses(Array.isArray(wh) ? wh : []);
          setItems(Array.isArray(it) ? it : it?.items ?? []);
          if (distributionMode && mainWarehouseId && assignedWarehouseId) {
            setFromId(mainWarehouseId);
            setToId(assignedWarehouseId);
          }
          setLoadingWarehouses(false);
        })
        .catch(() => setLoadingWarehouses(false));
    }
  }, [open, distributionMode, mainWarehouseId, assignedWarehouseId, itemCategoryFilter]);

  useEffect(() => {
    if (open) setItemId("");
  }, [itemCategoryFilter, open]);

  useEffect(() => {
    if (itemId && fromId) {
      fetch(`/api/admin/inventory/items/${itemId}/stock`)
        .then((r) => r.ok ? r.json() : [])
        .then((stock: { warehouse_id: string; quantity: number }[]) => {
          const w = stock.find((s) => s.warehouse_id === fromId);
          setAvailableQty(w ? w.quantity : 0);
        });
    } else {
      setAvailableQty(null);
    }
  }, [itemId, fromId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity) || 0;
    if (!itemId || !fromId || !toId || qty <= 0) {
      alert("يرجى تعبئة جميع الحقول");
      return;
    }
    if (fromId === toId) {
      alert("المخزن المصدر والهدف يجب أن يكونا مختلفين");
      return;
    }
    if (availableQty != null && qty > availableQty) {
      alert(`الكمية المتاحة: ${availableQty}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        item_id: itemId,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        quantity: qty,
        notes: notes.trim() || undefined,
      };
      if (!navigator.onLine) {
        addToQueue({ type: "stock_transfer", data: payload });
        setOpen(false);
        setItemId("");
        setFromId("");
        setToId("");
        setQuantity("");
        setNotes("");
        alert("انقطع الاتصال. تم حفظ طلب النقل. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch("/api/admin/inventory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في النقل");
        return;
      }
      setOpen(false);
      setItemId("");
      setFromId("");
      setToId("");
      setQuantity("");
      setNotes("");
      window.dispatchEvent(new CustomEvent("alameen-inventory-refresh"));
    } catch (err) {
      if (!navigator.onLine) {
        addToQueue({
          type: "stock_transfer",
          data: {
            item_id: itemId,
            from_warehouse_id: fromId,
            to_warehouse_id: toId,
            quantity: qty,
            notes: notes.trim() || undefined,
          },
        });
        setOpen(false);
        setItemId("");
        setFromId("");
        setToId("");
        setQuantity("");
        setNotes("");
        alert("انقطع الاتصال. تم حفظ طلب النقل. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
      } else {
        alert(getErrorMessage(err, "حدث خطأ"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!newWarehouseName.trim()) return;
    setAddingWarehouse(true);
    try {
      const res = await fetch("/api/admin/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWarehouseName.trim(), type: "distribution" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في الإضافة");
        return;
      }
      setWarehouses((prev) => [...prev, { id: data.id, name: data.name, type: data.type }]);
      setNewWarehouseName("");
    } catch (err) {
      alert(getErrorMessage(err, "حدث خطأ"));
    } finally {
      setAddingWarehouse(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {distributionMode ? "تحميل / إرجاع مخزون التوزيع" : "نقل بين المخازن"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {loadingWarehouses ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8">
              <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
            </div>
          ) : warehouses.length > 0 && warehouses.length < 2 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">نقل بين المخازن</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                تحتاج إلى مخزنين على الأقل. حالياً لديك مخزن واحد ({warehouses[0]?.name}).
              </p>
              <form onSubmit={handleAddWarehouse} className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newWarehouseName}
                    onChange={(e) => setNewWarehouseName(e.target.value)}
                    placeholder="اسم المخزن الجديد"
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={addingWarehouse || !newWarehouseName.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {addingWarehouse ? "..." : "إضافة مخزن"}
                  </button>
                </div>
              </form>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg"
              >
                إغلاق
              </button>
            </div>
          ) : warehouses.length >= 2 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">
              {distributionMode ? "نقل للتوزيع أو إرجاع للرئيسي" : "نقل بين المخازن"}
            </h3>
            {distributionMode && assignedWarehouseName && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                مخزنك: <strong>{assignedWarehouseName}</strong> — يمكن التحميل من الرئيسي أو إرجاع الفائض إليه.
              </p>
            )}
            {distributionMode && (
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${fromId === mainWarehouseId && toId === assignedWarehouseId ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"}`}
                  onClick={() => {
                    if (mainWarehouseId && assignedWarehouseId) {
                      setFromId(mainWarehouseId);
                      setToId(assignedWarehouseId);
                    }
                  }}
                >
                  تحميل من الرئيسي
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${fromId === assignedWarehouseId && toId === mainWarehouseId ? "bg-amber-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"}`}
                  onClick={() => {
                    if (mainWarehouseId && assignedWarehouseId) {
                      setFromId(assignedWarehouseId);
                      setToId(mainWarehouseId);
                    }
                  }}
                >
                  إرجاع للرئيسي
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <InventoryCategoryFilter
                id="transfer-stock-category"
                loadOnMount={open}
                value={itemCategoryFilter}
                onChange={setItemCategoryFilter}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الصنف</label>
                <select
                  value={itemId}
                  onChange={(e) => {
                    setItemId(e.target.value);
                    if (!distributionMode) {
                      setFromId("");
                      setToId("");
                    }
                    setQuantity("");
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                >
                  <option value="">اختر الصنف</option>
                  {items.filter((i) => i.quantity > 0).map((i) => (
                    <option key={i.id} value={i.id}>{i.name} (إجمالي: {i.quantity})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">من مخزن</label>
                <select
                  value={fromId}
                  onChange={(e) => {
                    setFromId(e.target.value);
                    if (!distributionMode) setToId("");
                    setQuantity("");
                  }}
                  disabled={distributionMode}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-70"
                  required
                >
                  <option value="">اختر المخزن المصدر</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {availableQty != null && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">المتاح: {availableQty}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">إلى مخزن</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  disabled={distributionMode}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-70"
                  required
                >
                  <option value="">اختر المخزن الهدف</option>
                  {warehouses.filter((w) => w.id !== fromId).map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الكمية</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="مثال: نقل لفرع"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-medium rounded-lg"
                >
                  {saving ? "جاري النقل..." : "نقل"}
                </button>
              </div>
            </form>
          </div>
          ) : null}
        </div>
      )}
    </>
  );
}
