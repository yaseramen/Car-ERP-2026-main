"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Line = {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  /** سعر البيع الحالي للصنف في المخزن (للعرض والتعديل مع فاتورة الشراء) */
  sale_price: number;
};

type Supplier = { id: string; name: string; phone?: string | null };

type InventoryRow = {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
  purchase_price: number;
  sale_price: number;
};

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm";

export function EditPurchaseInvoice({
  invoiceId,
  canEdit,
  blockReason,
  initialSupplierId,
  initialNotes,
  initialDiscount,
  initialTax,
  lines,
}: {
  invoiceId: string;
  canEdit: boolean;
  blockReason: string | null;
  initialSupplierId: string | null;
  initialNotes: string | null;
  initialDiscount: number;
  initialTax: number;
  lines: Line[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [discount, setDiscount] = useState(String(initialDiscount || ""));
  const [tax, setTax] = useState(String(initialTax || ""));
  const [rows, setRows] = useState<
    { lineId: string | null; item_id: string; quantity: string; unit_price: string; sale_price: string }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    setSupplierId(initialSupplierId ?? "");
    setNotes(initialNotes ?? "");
    setDiscount(String(initialDiscount || ""));
    setTax(String(initialTax || ""));
    setRows(
      lines.map((l) => ({
        lineId: l.id,
        item_id: l.item_id,
        quantity: String(l.quantity),
        unit_price: String(l.unit_price),
        sale_price: String(l.sale_price ?? 0),
      }))
    );
    fetch("/api/admin/suppliers?limit=500&offset=0")
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((d) => setSuppliers(Array.isArray(d) ? d : (d.suppliers ?? [])));
    fetch("/api/admin/inventory/items?limit=500&offset=0")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.items ?? []);
        setInventory(list);
      });
  }, [open, initialSupplierId, initialNotes, initialDiscount, initialTax, lines]);

  const inventoryOptions = useMemo(
    () =>
      inventory.map((i) => ({
        id: i.id,
        label: i.name,
        searchText: [i.code, i.category, i.name].filter(Boolean).join(" "),
      })),
    [inventory]
  );

  if (!canEdit) {
    return blockReason ? (
      <p className="text-xs text-amber-700 dark:text-amber-300 no-print max-w-md">{blockReason}</p>
    ) : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const discountAmt = Math.max(0, Number(discount) || 0);
    const taxAmt = Math.max(0, Number(tax) || 0);
    const payloadItems = rows
      .map((r) => {
        const qty = Number(r.quantity);
        const up = Number(r.unit_price);
        const spRaw = r.sale_price.trim();
        const sp = spRaw === "" ? null : Number(spRaw);
        if (!r.item_id || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(up) || up < 0) return null;
        if (sp !== null && (!Number.isFinite(sp) || sp < 0)) return null;
        return {
          ...(r.lineId ? { id: r.lineId } : {}),
          item_id: r.item_id,
          quantity: qty,
          unit_price: up,
          ...(sp !== null ? { sale_price: sp } : {}),
        };
      })
      .filter(Boolean) as {
        id?: string;
        item_id: string;
        quantity: number;
        unit_price: number;
        sale_price?: number;
      }[];

    if (payloadItems.length === 0) {
      alert("أضف بنداً واحداً على الأقل بكمية صحيحة");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/purchase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId || null,
          notes: notes.trim() || null,
          discount: discountAmt,
          tax: taxAmt,
          items: payloadItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل الحفظ");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      alert("حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white no-print"
      >
        تعديل فاتورة الشراء
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">تعديل فاتورة الشراء</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              يُعدَّل المخزون تلقائياً حسب الفرق في الكميات. لا يمكن الحفظ إذا وُجدت دفعات مسجّلة على الفاتورة.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المورد</label>
                <SearchableSelect
                  options={[
                    { id: "", label: "بدون مورد" },
                    ...suppliers.map((s) => ({
                      id: s.id,
                      label: s.name,
                      searchText: s.phone ? String(s.phone) : undefined,
                    })),
                  ]}
                  value={supplierId}
                  onChange={(id) => setSupplierId(id)}
                  placeholder="ابحث..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">الخصم (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">الضريبة (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">البنود</span>
                  <button
                    type="button"
                    className="text-sm text-emerald-600 hover:underline"
                    onClick={() =>
                      setRows((prev) => [
                        ...prev,
                        { lineId: null, item_id: "", quantity: "1", unit_price: "", sale_price: "" },
                      ])
                    }
                  >
                    + بند
                  </button>
                </div>
                <div className="space-y-3">
                  {rows.map((row, idx) => (
                    <div key={row.lineId ?? `new-${idx}`} className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 space-y-2">
                      <SearchableSelect
                        options={inventoryOptions}
                        value={row.item_id}
                        onChange={(id) => {
                          const it = inventory.find((x) => x.id === id);
                          setRows((prev) =>
                            prev.map((r, i) =>
                              i === idx
                                ? {
                                    ...r,
                                    item_id: id,
                                    unit_price: it ? String(it.purchase_price ?? 0) : r.unit_price,
                                    sale_price: it ? String(it.sale_price ?? 0) : r.sale_price,
                                  }
                                : r
                            )
                          );
                        }}
                        placeholder="اختر الصنف..."
                        className={inputClass}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">الكمية</label>
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={row.quantity}
                            onChange={(e) =>
                              setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 mb-0.5">سعر التكلفة (ج.م)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.unit_price}
                            onChange={(e) =>
                              setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: e.target.value } : r)))
                            }
                            className={inputClass}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] text-gray-500 mb-0.5">سعر البيع (ج.م) — يُحدَّث على بطاقة الصنف</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.sale_price}
                            onChange={(e) =>
                              setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, sale_price: e.target.value } : r)))
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="px-2 text-red-600 text-sm"
                          onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50"
                >
                  {saving ? "جاري..." : "حفظ التعديل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
