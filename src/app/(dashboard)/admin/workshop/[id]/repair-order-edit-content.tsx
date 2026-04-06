"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InventoryCategoryFilter } from "@/components/inventory/inventory-category-filter";

const STAGE_LABELS: Record<string, string> = {
  received: "استلام",
  inspection: "فحص",
  maintenance: "صيانة",
  ready: "جاهزة",
  completed: "مكتمل",
};

interface Order {
  id: string;
  order_number: string;
  vehicle_plate: string;
  vehicle_model: string | null;
  vehicle_year: number | null;
  mileage: number | null;
  vin: string | null;
  stage: string;
  inspection_notes: string | null;
  received_at: string | null;
  completed_at: string | null;
  customer_name: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_subtotal: number | null;
  invoice_digital_fee: number | null;
  invoice_total: number | null;
}

interface Item {
  id: string;
  item_name: string;
  item_unit: string;
  quantity: number;
  unit_price: number;
  discount_type?: string | null;
  discount_value?: number;
  tax_percent?: number | null;
  total: number;
}

interface Service {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_type?: string | null;
  discount_value?: number;
  tax_percent?: number | null;
  total: number;
}

interface PrevOrder {
  id: string;
  order_number: string;
  vehicle_plate: string;
  stage: string;
  inspection_notes: string | null;
  received_at: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_total: number | null;
}

const canEdit = (stage: string, orderType: string, invoiceId: string | null) =>
  !invoiceId && (stage === "maintenance" || stage === "ready" || (orderType === "inspection" && (stage === "inspection" || stage === "ready")));

const canAddParts = (stage: string, orderType: string) =>
  (stage === "maintenance" || stage === "ready") && orderType !== "inspection";

const canAddServices = (stage: string, orderType: string) =>
  stage === "maintenance" || stage === "ready" || (orderType === "inspection" && (stage === "inspection" || stage === "ready"));

export function RepairOrderEditContent({
  order,
  items: initialItems,
  services: initialServices,
  itemsTotal: initialItemsTotal,
  servicesTotal: initialServicesTotal,
  orderType,
  previousOrders,
  showPurchaseCost = false,
}: {
  order: Order;
  items: Item[];
  services: Service[];
  itemsTotal: number;
  servicesTotal: number;
  orderType: string;
  previousOrders: PrevOrder[];
  showPurchaseCost?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [services, setServices] = useState(initialServices);
  const [itemsTotal, setItemsTotal] = useState(initialItemsTotal);
  const [servicesTotal, setServicesTotal] = useState(initialServicesTotal);
  const [inspectionNotes, setInspectionNotes] = useState(order.inspection_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<
    {
      id: string;
      name: string;
      quantity: number;
      sale_price: number;
      purchase_price?: number;
      category?: string | null;
      code?: string | null;
      barcode?: string | null;
    }[]
  >([]);
  const [partCategoryFilter, setPartCategoryFilter] = useState("");
  const [addForm, setAddForm] = useState({ item_id: "", quantity: "1", discount_type: "" as "" | "percent" | "amount", discount_value: "", tax_percent: "" });
  const [serviceForm, setServiceForm] = useState({ description: "", quantity: "1", unit_price: "", discount_type: "" as "" | "percent" | "amount", discount_value: "", tax_percent: "" });
  const [saving, setSaving] = useState(false);

  const selectedPartItem = useMemo(
    () => inventoryItems.find((i) => i.id === addForm.item_id),
    [inventoryItems, addForm.item_id]
  );

  const partFormQty = useMemo(() => {
    const q = Number(addForm.quantity);
    if (!Number.isFinite(q) || q <= 0) return null;
    return q;
  }, [addForm.quantity]);

  const editable = canEdit(order.stage, orderType, order.invoice_id);

  const refreshItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/workshop/orders/${order.id}/items`);
      if (res.ok) {
        const list = await res.json();
        setItems(list);
        setItemsTotal(list.reduce((s: number, i: Item) => s + i.total, 0));
      }
    } catch {}
  }, [order.id]);

  const refreshServices = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/workshop/orders/${order.id}/services`);
      if (res.ok) {
        const list = await res.json();
        setServices(list);
        setServicesTotal(list.reduce((s: number, sv: Service) => s + sv.total, 0));
      }
    } catch {}
  }, [order.id]);

  useEffect(() => {
    if (!addPartOpen) return;
    const q = `/api/admin/inventory/items?limit=500&offset=0${partCategoryFilter ? `&category=${encodeURIComponent(partCategoryFilter)}` : ""}`;
    fetch(q)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.items ?? []);
        setInventoryItems(
          list.map(
            (i: {
              id: string;
              name: string;
              quantity?: number;
              sale_price?: number;
              purchase_price?: number;
              category?: string | null;
              code?: string | null;
              barcode?: string | null;
            }) => ({
              id: i.id,
              name: i.name,
              quantity: i.quantity ?? 0,
              sale_price: Number(i.sale_price ?? 0),
              purchase_price:
                i.purchase_price != null && Number.isFinite(Number(i.purchase_price))
                  ? Number(i.purchase_price)
                  : undefined,
              category: i.category,
              code: i.code,
              barcode: i.barcode,
            })
          )
        );
      });
  }, [addPartOpen, partCategoryFilter]);

  useEffect(() => {
    if (!addPartOpen) return;
    setAddForm((f) => ({ ...f, item_id: "" }));
  }, [partCategoryFilter, addPartOpen]);

  async function saveNotes() {
    if (!editable) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/workshop/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: order.stage, inspection_notes: inspectionNotes }),
      });
      if (res.ok) setInspectionNotes(inspectionNotes);
      else {
        const err = await res.json();
        alert(err.error || "فشل في حفظ الملاحظات");
      }
    } catch {
      alert("حدث خطأ");
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleAddPart(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.item_id) {
      alert("اختر قطعة");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { item_id: addForm.item_id, quantity: addForm.quantity };
      if (addForm.discount_type) {
        payload.discount_type = addForm.discount_type;
        payload.discount_value = Number(addForm.discount_value) || 0;
      }
      if (addForm.tax_percent !== "" && !Number.isNaN(Number(addForm.tax_percent))) {
        payload.tax_percent = Number(addForm.tax_percent);
      }
      const res = await fetch(`/api/admin/workshop/orders/${order.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await refreshItems();
        setAddForm({ item_id: "", quantity: "1", discount_type: "", discount_value: "", tax_percent: "" });
        setAddPartOpen(false);
      } else {
        const err = await res.json();
        alert(err.error || "فشل في إضافة القطعة");
      }
    } catch {
      alert("حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!editable || !confirm("إزالة هذه القطعة؟")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/workshop/orders/${order.id}/items?item_id=${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (res.ok) await refreshItems();
      else {
        const err = await res.json();
        alert(err.error || "فشل في الإزالة");
      }
    } catch {
      alert("حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceForm.description.trim()) {
      alert("وصف الخدمة مطلوب");
      return;
    }
    const qty = Number(serviceForm.quantity) || 1;
    const price = Number(serviceForm.unit_price) || 0;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { description: serviceForm.description.trim(), quantity: qty, unit_price: price };
      if (serviceForm.discount_type) {
        payload.discount_type = serviceForm.discount_type;
        payload.discount_value = Number(serviceForm.discount_value) || 0;
      }
      if (serviceForm.tax_percent !== "" && !Number.isNaN(Number(serviceForm.tax_percent))) {
        payload.tax_percent = Number(serviceForm.tax_percent);
      }
      const res = await fetch(`/api/admin/workshop/orders/${order.id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await refreshServices();
        setServiceForm({ description: "", quantity: "1", unit_price: "", discount_type: "", discount_value: "", tax_percent: "" });
        setAddServiceOpen(false);
      } else {
        const err = await res.json();
        alert(err.error || "فشل في إضافة الخدمة");
      }
    } catch {
      alert("حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveService(serviceId: string) {
    if (!editable || !confirm("إزالة هذه الخدمة؟")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/workshop/orders/${order.id}/services?service_id=${encodeURIComponent(serviceId)}`, { method: "DELETE" });
      if (res.ok) await refreshServices();
      else {
        const err = await res.json();
        alert(err.error || "فشل في الإزالة");
      }
    } catch {
      alert("حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500";

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <Link href="/admin/workshop" className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">
          ← العودة للورشة
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">أمر إصلاح {order.order_number}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          تقرير كامل لأمر الإصلاح — {order.vehicle_plate}
          {order.vehicle_model && ` • ${order.vehicle_model}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">بيانات السيارة</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">رقم اللوحة</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-medium">{order.vehicle_plate}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">الموديل</dt>
              <dd className="text-gray-900 dark:text-gray-100">{order.vehicle_model || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">سنة الصنع</dt>
              <dd className="text-gray-900 dark:text-gray-100">{order.vehicle_year || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">الكمية (كم)</dt>
              <dd className="text-gray-900 dark:text-gray-100">{order.mileage != null ? order.mileage.toLocaleString("ar-EG") : "—"}</dd>
            </div>
            {order.vin && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">VIN</dt>
                <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs">{order.vin}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">حالة الأمر</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">المرحلة</dt>
              <dd>
                <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
                  {STAGE_LABELS[order.stage] || order.stage}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">العميل</dt>
              <dd className="text-gray-900 dark:text-gray-100">{order.customer_name || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">تاريخ الاستلام</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {order.received_at ? new Date(order.received_at).toLocaleString("ar-EG") : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500 dark:text-gray-400">تاريخ الإكمال</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {order.completed_at ? new Date(order.completed_at).toLocaleString("ar-EG") : "—"}
              </dd>
            </div>
            {order.invoice_number && (
              <div className="flex justify-between">
                <dt className="text-gray-500 dark:text-gray-400">رقم الفاتورة</dt>
                <dd className="text-gray-900 dark:text-gray-100 font-medium">
                  {order.invoice_id ? (
                    <Link href={`/admin/invoices/${order.invoice_id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                      {order.invoice_number}
                    </Link>
                  ) : (
                    order.invoice_number
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {previousOrders.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">سجل الزيارات السابقة</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">رقم الأمر</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">اللوحة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">المرحلة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">ملاحظات الفحص</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الفاتورة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {previousOrders.map((prev) => (
                  <tr key={prev.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm">
                      <Link href={`/admin/workshop/${prev.id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                        {prev.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{prev.vehicle_plate}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {STAGE_LABELS[prev.stage] || prev.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={prev.inspection_notes ?? undefined}>
                      {prev.inspection_notes ? (prev.inspection_notes.length > 50 ? prev.inspection_notes.slice(0, 50) + "…" : prev.inspection_notes) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {prev.invoice_number && prev.invoice_id ? (
                        <Link href={`/admin/invoices/${prev.invoice_id}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                          {prev.invoice_number} ({prev.invoice_total?.toFixed(0)} ج.م)
                        </Link>
                      ) : prev.invoice_number ? (
                        <span>{prev.invoice_number} ({prev.invoice_total?.toFixed(0)} ج.م)</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {prev.received_at ? new Date(prev.received_at).toLocaleDateString("ar-EG") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2">ملاحظات الفحص</h2>
        {editable ? (
          <div className="space-y-2">
            <textarea
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              placeholder="أدخل ملاحظات الفحص..."
              rows={4}
              className={`${inputClass} resize-none`}
            />
            <button
              type="button"
              onClick={saveNotes}
              disabled={savingNotes}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-medium rounded-lg transition"
            >
              {savingNotes ? "جاري الحفظ..." : "حفظ الملاحظات"}
            </button>
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap">{order.inspection_notes || "—"}</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">القطع المثبتة</h2>
          {editable && canAddParts(order.stage, orderType) && (
            <button
              type="button"
              onClick={() => setAddPartOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition"
            >
              إضافة قطعة
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {items.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الصنف</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الكمية</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">سعر الوحدة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الخصم</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">ضريبة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                  {editable && <th className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 w-16" />}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const base = item.quantity * item.unit_price;
                  let disc = 0;
                  if (item.discount_type === "percent" && (item.discount_value ?? 0) > 0) disc = base * (Math.min(100, item.discount_value!) / 100);
                  else if (item.discount_type === "amount" && (item.discount_value ?? 0) > 0) disc = Math.min(base, item.discount_value!);
                  const after = Math.max(0, base - disc);
                  const tax = (item.tax_percent != null && item.tax_percent > 0) ? after * (Math.min(100, item.tax_percent) / 100) : 0;
                  const discLabel = item.discount_type === "percent" ? `${item.discount_value}%` : item.discount_type === "amount" ? `${item.discount_value} ج.م` : "—";
                  const taxLabel = item.tax_percent != null && item.tax_percent > 0 ? `${item.tax_percent}%` : "—";
                  return (
                  <tr key={item.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.item_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {item.quantity} {item.item_unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{item.unit_price.toFixed(2)} ج.م</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{discLabel}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{taxLabel}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{item.total.toFixed(2)} ج.م</td>
                    {editable && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={saving}
                          className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                        >
                          إزالة
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-700/50 font-medium">
                  <td colSpan={5} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                    المجموع (القطع)
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{itemsTotal.toFixed(2)} ج.م</td>
                  {editable && <td />}
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              لم تُضف قطع حتى الآن
              {editable && canAddParts(order.stage, orderType) && (
                <button
                  type="button"
                  onClick={() => setAddPartOpen(true)}
                  className="block mx-auto mt-2 text-purple-600 hover:text-purple-700 text-sm"
                >
                  إضافة قطعة
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">الخدمات</h2>
          {editable && canAddServices(order.stage, orderType) && (
            <button
              type="button"
              onClick={() => setAddServiceOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
            >
              إضافة خدمة
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          {services.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الوصف</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الكمية</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">سعر الوحدة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الخصم</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">ضريبة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                  {editable && <th className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 w-16" />}
                </tr>
              </thead>
              <tbody>
                {services.map((sv) => {
                  const base = sv.quantity * sv.unit_price;
                  let disc = 0;
                  if (sv.discount_type === "percent" && (sv.discount_value ?? 0) > 0) disc = base * (Math.min(100, sv.discount_value!) / 100);
                  else if (sv.discount_type === "amount" && (sv.discount_value ?? 0) > 0) disc = Math.min(base, sv.discount_value!);
                  const discLabel = sv.discount_type === "percent" ? `${sv.discount_value}%` : sv.discount_type === "amount" ? `${sv.discount_value} ج.م` : "—";
                  const taxLabel = sv.tax_percent != null && sv.tax_percent > 0 ? `${sv.tax_percent}%` : "—";
                  return (
                  <tr key={sv.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{sv.description}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{sv.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{sv.unit_price.toFixed(2)} ج.م</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{discLabel}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{taxLabel}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{sv.total.toFixed(2)} ج.م</td>
                    {editable && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleRemoveService(sv.id)}
                          disabled={saving}
                          className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                        >
                          إزالة
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-700/50 font-medium">
                  <td colSpan={5} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                    المجموع (الخدمات)
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{servicesTotal.toFixed(2)} ج.م</td>
                  {editable && <td />}
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-700/50 font-medium">
                  <td colSpan={5} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                    المجموع الكلي
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{(itemsTotal + servicesTotal).toFixed(2)} ج.م</td>
                  {editable && <td />}
                </tr>
                {order.invoice_digital_fee != null && order.invoice_digital_fee > 0 && (
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <td colSpan={editable ? 4 : 3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                      الخدمة الرقمية
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{order.invoice_digital_fee.toFixed(2)} ج.م</td>
                  </tr>
                )}
                {order.invoice_total != null && (
                  <tr className="bg-emerald-50 dark:bg-emerald-900/50 font-bold">
                    <td colSpan={editable ? 4 : 3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                      الإجمالي النهائي
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">{order.invoice_total.toFixed(2)} ج.م</td>
                  </tr>
                )}
              </tfoot>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              لم تُضف خدمات حتى الآن
              {editable && canAddServices(order.stage, orderType) && (
                <button
                  type="button"
                  onClick={() => setAddServiceOpen(true)}
                  className="block mx-auto mt-2 text-blue-600 hover:text-blue-700 text-sm"
                >
                  إضافة خدمة
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {addPartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إضافة قطعة</h3>
            <form onSubmit={handleAddPart} className="space-y-4">
              <InventoryCategoryFilter
                id="repair-edit-part-category"
                loadOnMount={addPartOpen}
                value={partCategoryFilter}
                onChange={setPartCategoryFilter}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                «كل الأقسام» يعرض كل الأصناف؛ اختر قسماً لتضييق القائمة.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">الصنف</label>
                <SearchableSelect
                  options={inventoryItems
                    .filter((i) => i.quantity > 0)
                    .map((i) => ({
                      id: i.id,
                      label: `${i.name} (متاح: ${i.quantity})`,
                      searchText: [i.code, i.barcode, i.category, i.name].filter(Boolean).join(" "),
                    }))}
                  value={addForm.item_id}
                  onChange={(id) => setAddForm((f) => ({ ...f, item_id: id }))}
                  placeholder="ابحث بالاسم أو الكود أو الباركود..."
                  className={inputClass}
                />
                {selectedPartItem && selectedPartItem.quantity > 0 && (
                  <div
                    className={`mt-3 grid gap-3 ${showPurchaseCost ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
                  >
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/35 px-4 py-3 text-center sm:text-right">
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-1">
                        {partFormQty != null
                          ? `إجمالي البيع للكمية (${partFormQty})`
                          : "سعر البيع (وحدة)"}
                      </p>
                      <p className="text-lg font-bold text-emerald-950 dark:text-emerald-50 tabular-nums">
                        {(partFormQty != null
                          ? selectedPartItem.sale_price * partFormQty
                          : selectedPartItem.sale_price
                        ).toFixed(2)}{" "}
                        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">ج.م</span>
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                        سعر الوحدة: {selectedPartItem.sale_price.toFixed(2)} ج.م
                        {partFormQty != null ? ` × ${partFormQty}` : " — أدخل الكمية لحساب إجمالي السطر"}
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                        المتاح في المخزن: {selectedPartItem.quantity}
                      </p>
                    </div>
                    {showPurchaseCost && (
                      <div
                        className={`rounded-xl border px-4 py-3 text-center sm:text-right ${
                          selectedPartItem.purchase_price != null &&
                          Number.isFinite(selectedPartItem.purchase_price) &&
                          selectedPartItem.purchase_price > 0 &&
                          selectedPartItem.sale_price + 1e-9 < selectedPartItem.purchase_price
                            ? "border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/30"
                            : "border-sky-200 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/35"
                        }`}
                      >
                        <p
                          className={`text-xs font-semibold mb-1 ${
                            selectedPartItem.purchase_price != null &&
                            Number.isFinite(selectedPartItem.purchase_price) &&
                            selectedPartItem.purchase_price > 0 &&
                            selectedPartItem.sale_price + 1e-9 < selectedPartItem.purchase_price
                              ? "text-red-900 dark:text-red-100"
                              : "text-sky-900 dark:text-sky-100"
                          }`}
                        >
                          {partFormQty != null
                            ? `إجمالي الشراء للكمية (${partFormQty})`
                            : "سعر الشراء (وحدة)"}
                        </p>
                        {selectedPartItem.purchase_price != null &&
                        Number.isFinite(selectedPartItem.purchase_price) &&
                        selectedPartItem.purchase_price > 0 ? (
                          <>
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                              {(partFormQty != null
                                ? selectedPartItem.purchase_price * partFormQty
                                : selectedPartItem.purchase_price
                              ).toFixed(2)}{" "}
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">ج.م</span>
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              تكلفة الوحدة: {selectedPartItem.purchase_price.toFixed(2)} ج.م
                              {partFormQty != null ? ` × ${partFormQty}` : ""}
                            </p>
                            {selectedPartItem.sale_price + 1e-9 < selectedPartItem.purchase_price ? (
                              <p className="text-xs text-red-800 dark:text-red-200 mt-1 font-medium">
                                تنبيه: سعر البيع أقل من سعر الشراء (للوحدة)
                              </p>
                            ) : (
                              <p className="text-xs text-sky-800 dark:text-sky-200 mt-1">
                                هامش تقريبي
                                {partFormQty != null
                                  ? ` للكمية: ${(
                                      (selectedPartItem.sale_price - selectedPartItem.purchase_price) *
                                      partFormQty
                                    ).toFixed(2)} ج.م`
                                  : `: ${(selectedPartItem.sale_price - selectedPartItem.purchase_price).toFixed(
                                      2
                                    )} ج.م للوحدة`}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            غير مسجّل — حدّثه من المخزن أو فاتورة شراء
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">الكمية</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={addForm.quantity}
                  onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
                  required
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">الخصم</label>
                  <div className="flex gap-2">
                    <select
                      value={addForm.discount_type}
                      onChange={(e) => setAddForm((f) => ({ ...f, discount_type: e.target.value as "" | "percent" | "amount" }))}
                      className={inputClass}
                    >
                      <option value="">بدون</option>
                      <option value="percent">نسبة %</option>
                      <option value="amount">مبلغ (ج.م)</option>
                    </select>
                    {(addForm.discount_type === "percent" || addForm.discount_type === "amount") && (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={addForm.discount_value}
                        onChange={(e) => setAddForm((f) => ({ ...f, discount_value: e.target.value }))}
                        placeholder={addForm.discount_type === "percent" ? "0-100" : "0"}
                        className={inputClass}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ضريبة % (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={addForm.tax_percent}
                    onChange={(e) => setAddForm((f) => ({ ...f, tax_percent: e.target.value }))}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setAddPartOpen(false)} className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 rounded-lg">
                  إلغاء
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
                  {saving ? "جاري..." : "إضافة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addServiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إضافة خدمة</h3>
            <form onSubmit={handleAddService} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">وصف الخدمة *</label>
                <input
                  type="text"
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))}
                  required
                  className={inputClass}
                  placeholder="مثال: فحص المحرك"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">الكمية</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={serviceForm.quantity}
                    onChange={(e) => setServiceForm((f) => ({ ...f, quantity: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">السعر (ج.م)</label>
                  <input
                    type="number"
                    step="any"
                    value={serviceForm.unit_price}
                    onChange={(e) => setServiceForm((f) => ({ ...f, unit_price: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">الخصم</label>
                  <div className="flex gap-2">
                    <select
                      value={serviceForm.discount_type}
                      onChange={(e) => setServiceForm((f) => ({ ...f, discount_type: e.target.value as "" | "percent" | "amount" }))}
                      className={inputClass}
                    >
                      <option value="">بدون</option>
                      <option value="percent">نسبة %</option>
                      <option value="amount">مبلغ (ج.م)</option>
                    </select>
                    {(serviceForm.discount_type === "percent" || serviceForm.discount_type === "amount") && (
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={serviceForm.discount_value}
                        onChange={(e) => setServiceForm((f) => ({ ...f, discount_value: e.target.value }))}
                        placeholder={serviceForm.discount_type === "percent" ? "0-100" : "0"}
                        className={inputClass}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ضريبة % (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={serviceForm.tax_percent}
                    onChange={(e) => setServiceForm((f) => ({ ...f, tax_percent: e.target.value }))}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setAddServiceOpen(false)} className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 rounded-lg">
                  إلغاء
                </button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  {saving ? "جاري..." : "إضافة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
