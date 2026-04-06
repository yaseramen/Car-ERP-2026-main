"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InventoryCategoryFilter } from "@/components/inventory/inventory-category-filter";
import { addToQueue } from "@/lib/offline-queue";

const STAGES = [
  { id: "received", label: "استلام", color: "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200" },
  { id: "inspection", label: "فحص", color: "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200" },
  { id: "maintenance", label: "صيانة", color: "bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200" },
  { id: "ready", label: "جاهزة", color: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200" },
  { id: "completed", label: "مكتمل", color: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200" },
];

interface RepairOrder {
  id: string;
  order_number: string;
  order_type?: string;
  customer_name: string | null;
  customer_phone?: string | null;
  vehicle_plate: string;
  vehicle_model: string | null;
  vehicle_year: number | null;
  stage: string;
  inspection_notes: string | null;
  received_at: string;
  completed_at: string | null;
  created_at: string;
  items_count?: number;
  items_total?: number;
  services_count?: number;
  services_total?: number;
  invoice_number?: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  sale_price: number;
  /** يُرسل من الـ API للمالك والسوبر أدمن فقط */
  purchase_price?: number;
  category?: string | null;
  code?: string | null;
  barcode?: string | null;
}

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface OrderService {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export function WorkshopContent({ showPurchaseCost = false }: { showPurchaseCost?: boolean }) {
  const [orders, setOrders] = useState<RepairOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [addPartsOpen, setAddPartsOpen] = useState(false);
  const [addServicesOpen, setAddServicesOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderServices, setOrderServices] = useState<OrderService[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [partCategoryFilter, setPartCategoryFilter] = useState("");
  const [addForm, setAddForm] = useState(() => {
    if (typeof window === "undefined") return { item_id: "", quantity: "1", discount_type: "" as "" | "percent" | "amount", discount_value: "", tax_percent: "" };
    try {
      const raw = localStorage.getItem("alameen-workshop-part-draft");
      const parsed = raw ? JSON.parse(raw) : {};
      return { item_id: parsed.item_id ?? "", quantity: parsed.quantity ?? "1", discount_type: parsed.discount_type ?? "", discount_value: parsed.discount_value ?? "", tax_percent: parsed.tax_percent ?? "" };
    } catch {
      return { item_id: "", quantity: "1", discount_type: "" as "" | "percent" | "amount", discount_value: "", tax_percent: "" };
    }
  });
  const [serviceForm, setServiceForm] = useState(() => {
    if (typeof window === "undefined") return { description: "", quantity: "1", unit_price: "", discount_type: "" as "" | "percent" | "amount", discount_value: "", tax_percent: "" };
    try {
      const raw = localStorage.getItem("alameen-workshop-service-draft");
      const parsed = raw ? JSON.parse(raw) : {};
      return { description: parsed.description ?? "", quantity: parsed.quantity ?? "1", unit_price: parsed.unit_price ?? "", discount_type: parsed.discount_type ?? "", discount_value: parsed.discount_value ?? "", tax_percent: parsed.tax_percent ?? "" };
    } catch {
      return { description: "", quantity: "1", unit_price: "", discount_type: "" as "" | "percent" | "amount", discount_value: "", tax_percent: "" };
    }
  });
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<{ id: string; name: string; phone?: string | null }[]>([]);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", email: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [form, setForm] = useState({
    vehicle_plate: "",
    vehicle_model: "",
    vehicle_year: "",
    mileage: "",
    customer_id: "",
  });
  const [inspectionNotesDrafts, setInspectionNotesDrafts] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("alameen-workshop-notes");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [customerVehicles, setCustomerVehicles] = useState<
    { vehicle_plate: string; vehicle_model: string | null; vehicle_year: number | null; mileage: number | null }[]
  >([]);
  const [typeFilter, setTypeFilter] = useState<"" | "maintenance" | "inspection">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOrderType, setModalOrderType] = useState<"maintenance" | "inspection">("maintenance");
  const [inspectionChecklistOpen, setInspectionChecklistOpen] = useState(false);
  const [checklistItems, setChecklistItems] = useState<{ id: string; name_ar: string }[]>([]);
  const [checklistResults, setChecklistResults] = useState<Record<string, { status: string; notes: string }>>({});
  const [generalNotes, setGeneralNotes] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  const selectedPartItem = useMemo(
    () => inventoryItems.find((i) => i.id === addForm.item_id),
    [inventoryItems, addForm.item_id]
  );

  /** كمية السطر لحساب إجمالي البيع/الشراء المعروض (كسور مسموحة مثل 0.6) */
  const partFormQty = useMemo(() => {
    const q = Number(addForm.quantity);
    if (!Number.isFinite(q) || q <= 0) return null;
    return q;
  }, [addForm.quantity]);

  async function fetchOrders() {
    try {
      const url = typeFilter ? `/api/admin/workshop/orders?type=${typeFilter}` : "/api/admin/workshop/orders";
      const res = await fetch(url);
      if (res.ok) setOrders(await res.json());
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrderItems(orderId: string) {
    try {
      const res = await fetch(`/api/admin/workshop/orders/${orderId}/items`);
      if (res.ok) setOrderItems(await res.json());
    } catch {
      setOrderItems([]);
    }
  }

  async function fetchOrderServices(orderId: string) {
    try {
      const res = await fetch(`/api/admin/workshop/orders/${orderId}/services`);
      if (res.ok) setOrderServices(await res.json());
    } catch {
      setOrderServices([]);
    }
  }

  async function fetchInventoryItems(category?: string) {
    try {
      const cat = category ?? partCategoryFilter;
      const q = `/api/admin/inventory/items?limit=500&offset=0${cat ? `&category=${encodeURIComponent(cat)}` : ""}`;
      const res = await fetch(q);
      if (res.ok) {
        const d = await res.json();
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
      }
    } catch {
      setInventoryItems([]);
    }
  }

  async function fetchCustomers() {
    try {
      const res = await fetch("/api/admin/customers?limit=500&offset=0");
      if (res.ok) {
        const d = await res.json();
        const list = Array.isArray(d) ? d : (d.customers ?? []);
        setCustomers(list.map((c: { id: string; name: string; phone?: string | null }) => ({ id: c.id, name: c.name, phone: c.phone ?? null })));
      }
    } catch {}
  }

  async function handleAddCustomer(e: React.FormEvent) {
    if (e?.preventDefault) e.preventDefault();
    if (!newCustomerForm.name.trim()) {
      alert("اسم العميل مطلوب");
      return;
    }
    const payload = {
      name: newCustomerForm.name.trim(),
      phone: newCustomerForm.phone.trim() || undefined,
      email: newCustomerForm.email.trim() || undefined,
    };
    setSavingCustomer(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "add_customer", data: payload });
        setAddCustomerOpen(false);
        setNewCustomerForm({ name: "", phone: "", email: "" });
        alert("انقطع الاتصال. تم حفظ العميل محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إضافة العميل");
        return;
      }
      const newCustomer = await res.json();
      setCustomers((prev) => [
        { id: newCustomer.id, name: newCustomer.name, phone: newCustomer.phone ?? null },
        ...prev,
      ]);
      setForm((f) => ({ ...f, customer_id: newCustomer.id }));
      setAddCustomerOpen(false);
      setNewCustomerForm({ name: "", phone: "", email: "" });
      fetchCustomers();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "add_customer", data: payload });
        setAddCustomerOpen(false);
        setNewCustomerForm({ name: "", phone: "", email: "" });
        alert("انقطع الاتصال. تم حفظ العميل محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setSavingCustomer(false);
    }
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [typeFilter]);

  useEffect(() => {
    if (Object.keys(inspectionNotesDrafts).length > 0) {
      try {
        localStorage.setItem("alameen-workshop-notes", JSON.stringify(inspectionNotesDrafts));
      } catch {}
    }
  }, [inspectionNotesDrafts]);

  useEffect(() => {
    try {
      if (serviceForm.description || serviceForm.quantity !== "1" || serviceForm.unit_price) {
        localStorage.setItem("alameen-workshop-service-draft", JSON.stringify(serviceForm));
      } else {
        localStorage.removeItem("alameen-workshop-service-draft");
      }
    } catch {}
  }, [serviceForm]);

  useEffect(() => {
    try {
      if (addForm.item_id || addForm.quantity !== "1") {
        localStorage.setItem("alameen-workshop-part-draft", JSON.stringify(addForm));
      } else {
        localStorage.removeItem("alameen-workshop-part-draft");
      }
    } catch {}
  }, [addForm]);

  useEffect(() => {
    const handleOnline = () => {
      fetchOrders();
      fetchCustomers();
    };
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, [typeFilter]);

  useEffect(() => {
    if (addPartsOpen && selectedOrder) {
      fetchOrderItems(selectedOrder.id);
      fetchInventoryItems(partCategoryFilter);
    }
  }, [addPartsOpen, selectedOrder, partCategoryFilter]);

  useEffect(() => {
    if (!addPartsOpen) return;
    setAddForm((f) => ({ ...f, item_id: "" }));
  }, [partCategoryFilter, addPartsOpen]);

  useEffect(() => {
    if (addServicesOpen && selectedOrder) {
      fetchOrderServices(selectedOrder.id);
    }
  }, [addServicesOpen, selectedOrder]);

  useEffect(() => {
    if (inspectionChecklistOpen && selectedOrder) {
      setGeneralNotes(selectedOrder.inspection_notes ?? "");
      Promise.all([
        fetch("/api/admin/workshop/inspection-checklist").then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/admin/workshop/orders/${selectedOrder.id}/inspection-results`).then((r) => (r.ok ? r.json() : [])),
      ]).then(([items, results]) => {
        setChecklistItems(items);
        const map: Record<string, { status: string; notes: string }> = {};
        for (const it of items) {
          const r = results.find((x: { checklist_item_id: string }) => x.checklist_item_id === it.id);
          map[it.id] = { status: r?.status ?? "na", notes: r?.notes ?? "" };
        }
        setChecklistResults(map);
      });
    }
  }, [inspectionChecklistOpen, selectedOrder]);

  useEffect(() => {
    if (form.customer_id) {
      fetch(`/api/admin/customers/${form.customer_id}/vehicles`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setCustomerVehicles)
        .catch(() => setCustomerVehicles([]));
    } else {
      setCustomerVehicles([]);
    }
  }, [form.customer_id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      vehicle_plate: form.vehicle_plate.trim(),
      vehicle_model: form.vehicle_model.trim() || undefined,
      vehicle_year: form.vehicle_year ? Number(form.vehicle_year) : undefined,
      mileage: form.mileage ? Number(form.mileage) : undefined,
      customer_id: form.customer_id || undefined,
      order_type: modalOrderType,
    };

    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "create_repair_order", data: payload });
        setModalOpen(false);
        setForm({ vehicle_plate: "", vehicle_model: "", vehicle_year: "", mileage: "", customer_id: "" });
        setModalOrderType("maintenance");
        alert("انقطع الاتصال. تم حفظ أمر الاستلام محلياً. سيتم إنشاؤه تلقائياً عند عودة الإنترنت.");
        return;
      }

      const res = await fetch("/api/admin/workshop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في الإنشاء");
        return;
      }

      await fetchOrders();
      setModalOpen(false);
      setForm({ vehicle_plate: "", vehicle_model: "", vehicle_year: "", mileage: "", customer_id: "" });
      setModalOrderType("maintenance");
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "create_repair_order", data: payload });
        setModalOpen(false);
        setForm({ vehicle_plate: "", vehicle_model: "", vehicle_year: "", mileage: "", customer_id: "" });
        setModalOrderType("maintenance");
        alert("انقطع الاتصال. تم حفظ أمر الاستلام محلياً. سيتم إنشاؤه تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    const desc = serviceForm.description.trim();
    const qty = Number(serviceForm.quantity) || 1;
    const price = Number(serviceForm.unit_price) || 0;
    if (!desc) {
      alert("وصف الخدمة مطلوب");
      return;
    }
    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "add_service", orderId: selectedOrder.id, data: { description: desc, quantity: qty, unit_price: price } });
        setServiceForm({ description: "", quantity: "1", unit_price: "", discount_type: "", discount_value: "", tax_percent: "" });
        alert("انقطع الاتصال. تم حفظ الخدمة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        setAddServicesOpen(false);
        setSelectedOrder(null);
        return;
      }
      const payload: Record<string, unknown> = { description: desc, quantity: qty, unit_price: price };
      if (serviceForm.discount_type) {
        payload.discount_type = serviceForm.discount_type;
        payload.discount_value = Number(serviceForm.discount_value) || 0;
      }
      if (serviceForm.tax_percent !== "" && !Number.isNaN(Number(serviceForm.tax_percent))) payload.tax_percent = Number(serviceForm.tax_percent);
      const res = await fetch(`/api/admin/workshop/orders/${selectedOrder.id}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إضافة الخدمة");
        return;
      }
      await fetchOrderServices(selectedOrder.id);
      await fetchOrders();
      setServiceForm({ description: "", quantity: "1", unit_price: "", discount_type: "", discount_value: "", tax_percent: "" });
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "add_service", orderId: selectedOrder.id, data: { description: desc, quantity: qty, unit_price: price } });
        setServiceForm({ description: "", quantity: "1", unit_price: "", discount_type: "", discount_value: "", tax_percent: "" });
        alert("انقطع الاتصال. تم حفظ الخدمة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        setAddServicesOpen(false);
        setSelectedOrder(null);
      } else {
        alert("حدث خطأ. حاول مرة أخرى.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddPart(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    const itemId = addForm.item_id;
    const qty = Number(addForm.quantity) || 1;
    if (!itemId) {
      alert("اختر قطعة");
      return;
    }
    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "add_part", orderId: selectedOrder.id, data: { item_id: itemId, quantity: qty } });
        setAddForm({ item_id: "", quantity: "1", discount_type: "", discount_value: "", tax_percent: "" });
        alert("انقطع الاتصال. تم حفظ القطعة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        setAddPartsOpen(false);
        setSelectedOrder(null);
        return;
      }
      const payload: Record<string, unknown> = { item_id: itemId, quantity: qty };
      if (addForm.discount_type) {
        payload.discount_type = addForm.discount_type;
        payload.discount_value = Number(addForm.discount_value) || 0;
      }
      if (addForm.tax_percent !== "" && !Number.isNaN(Number(addForm.tax_percent))) payload.tax_percent = Number(addForm.tax_percent);
      const res = await fetch(`/api/admin/workshop/orders/${selectedOrder.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إضافة القطعة");
        return;
      }
      await fetchOrderItems(selectedOrder.id);
      await fetchOrders();
      setAddForm({ item_id: "", quantity: "1", discount_type: "", discount_value: "", tax_percent: "" });
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "add_part", orderId: selectedOrder.id, data: { item_id: itemId, quantity: qty } });
        setAddForm({ item_id: "", quantity: "1", discount_type: "", discount_value: "", tax_percent: "" });
        alert("انقطع الاتصال. تم حفظ القطعة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        setAddPartsOpen(false);
        setSelectedOrder(null);
      } else {
        alert("حدث خطأ. حاول مرة أخرى.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStage(orderId: string, newStage: string, inspectionNotes?: string) {
    const body: { stage: string; inspection_notes?: string } = { stage: newStage };
    if (inspectionNotes !== undefined) body.inspection_notes = inspectionNotes;

    if (newStage === "completed") {
      const ok = window.confirm(
        "سيتم إنشاء فاتورة صيانة وربطها بالأمر، ثم نقل الأمر إلى «مكتمل». هل تريد المتابعة؟"
      );
      if (!ok) return;
    }

    try {
      if (!navigator.onLine) {
        addToQueue({ type: "update_repair_order_stage", orderId, data: body });
        alert("انقطع الاتصال. تم حفظ تغيير المرحلة محلياً. سيتم تطبيقه تلقائياً عند عودة الإنترنت.");
        return;
      }

      const res = await fetch(`/api/admin/workshop/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في التحديث");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (newStage === "completed" && data?.invoice_number) {
        const invId = data.invoice_id as string | undefined;
        const already = data.already_completed === true;
        const msg = already
          ? `الأمر مكتمل مسبقاً. الفاتورة: ${data.invoice_number}`
          : `تم إنشاء الفاتورة ${data.invoice_number} وإكمال الأمر.`;
        if (invId && window.confirm(`${msg}\n\nفتح صفحة الفاتورة الآن؟`)) {
          window.location.href = `/admin/invoices/${invId}`;
          return;
        }
        alert(msg);
      }

      await fetchOrders();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "update_repair_order_stage", orderId, data: body });
        alert("انقطع الاتصال. تم حفظ تغيير المرحلة محلياً. سيتم تطبيقه تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    }
  }

  async function addChecklistItem() {
    const name = newItemName.trim();
    if (!name) return;
    setAddingItem(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "add_checklist_item", data: { name_ar: name } });
        setNewItemName("");
        alert("انقطع الاتصال. تم حفظ البند محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch("/api/admin/workshop/inspection-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_ar: name }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في الإضافة");
        return;
      }
      const item = await res.json();
      setChecklistItems((prev) => [...prev, item]);
      setChecklistResults((prev) => ({ ...prev, [item.id]: { status: "na", notes: "" } }));
      setNewItemName("");
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "add_checklist_item", data: { name_ar: name } });
        setNewItemName("");
        alert("انقطع الاتصال. تم حفظ البند محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setAddingItem(false);
    }
  }

  async function saveInspectionChecklist(orderId: string) {
    const payload = {
      results: checklistItems.map((it) => ({
        checklist_item_id: it.id,
        status: checklistResults[it.id]?.status ?? "na",
        notes: checklistResults[it.id]?.notes ?? "",
      })),
      general_notes: generalNotes,
    };

    try {
      if (!navigator.onLine) {
        addToQueue({ type: "save_inspection_checklist", orderId, data: payload });
        setInspectionChecklistOpen(false);
        setSelectedOrder(null);
        alert("انقطع الاتصال. تم حفظ قائمة الفحص محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch(`/api/admin/workshop/orders/${orderId}/inspection-results`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في الحفظ");
        return;
      }
      setInspectionChecklistOpen(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "save_inspection_checklist", orderId, data: payload });
        setInspectionChecklistOpen(false);
        setSelectedOrder(null);
        alert("انقطع الاتصال. تم حفظ قائمة الفحص محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    }
  }

  async function saveInspectionNotes(orderId: string, notes: string) {
    const payload = { stage: "inspection" as const, inspection_notes: notes };

    try {
      if (!navigator.onLine) {
        addToQueue({ type: "update_repair_order_stage", orderId, data: payload });
        alert("انقطع الاتصال. تم حفظ الملاحظات محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch(`/api/admin/workshop/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في الحفظ");
        return;
      }

      await fetchOrders();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "update_repair_order_stage", orderId, data: payload });
        alert("انقطع الاتصال. تم حفظ الملاحظات محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    }
  }

  const getNextStage = (current: string) => {
    const idx = STAGES.findIndex((s) => s.id === current);
    return idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
  };

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  const canAddParts = (stage: string, orderType?: string) =>
    (stage === "maintenance" || stage === "ready") && orderType !== "inspection";
  const canAddServices = (stage: string, orderType?: string) =>
    (stage === "maintenance" || stage === "ready" || (stage === "inspection" && orderType === "inspection")) ?? false;

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
      </div>
    );
  }

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredOrders = searchLower
    ? orders.filter(
        (o) =>
          (o.customer_name?.toLowerCase().includes(searchLower)) ||
          (o.customer_phone?.includes(searchQuery.trim())) ||
          o.vehicle_plate?.toLowerCase().includes(searchLower) ||
          (o.vehicle_model?.toLowerCase().includes(searchLower)) ||
          o.order_number?.toLowerCase().includes(searchLower)
      )
    : orders;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-gray-900 dark:text-gray-100">أوامر الإصلاح</h2>
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            <button
              type="button"
              onClick={() => setTypeFilter("")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${typeFilter === "" ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("maintenance")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${typeFilter === "maintenance" ? "bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
            >
              صيانة
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("inspection")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${typeFilter === "inspection" ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
            >
              فحص قبل البيع/الشراء
            </button>
          </div>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث: اسم العميل، هاتف، لوحة، موديل..."
            className="flex-1 min-w-[200px] max-w-xs px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setModalOrderType("maintenance");
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            استلام صيانة
          </button>
          <button
            onClick={() => {
              setModalOrderType("inspection");
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            استلام للفحص
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {STAGES.map((stage) => {
          const stageOrders = filteredOrders.filter((o) => o.stage === stage.id);
          return (
            <div
              key={stage.id}
              className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className={`p-3 ${stage.color} font-medium text-sm`}>
                {stage.label}
                <span className="mr-2 text-opacity-80">({stageOrders.length})</span>
              </div>
              <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
                {stageOrders.map((order) => {
                  const next = getNextStage(order.stage);
                  return (
                    <div
                      key={order.id}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700 shadow-sm"
                    >
                      <Link
                        href={`/admin/workshop/${order.id}`}
                        className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline block"
                      >
                        {order.order_number}
                      </Link>
                      <Link
                        href={`/admin/workshop/${order.id}`}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 mt-1 block"
                      >
                        {order.vehicle_plate}
                      </Link>
                      {order.customer_name && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{order.customer_name}</div>
                      )}
                      {order.customer_phone && (
                        <div className="text-xs text-gray-500 dark:text-gray-500" dir="ltr">{order.customer_phone}</div>
                      )}
                      {order.vehicle_model && (
                        <div className="text-xs text-gray-500 dark:text-gray-500">{order.vehicle_model}</div>
                      )}
                      {order.stage === "inspection" && (
                        <div className="mt-2 space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block">ملاحظات الفحص</label>
                          <textarea
                            value={inspectionNotesDrafts[order.id] ?? order.inspection_notes ?? ""}
                            onChange={(e) =>
                              setInspectionNotesDrafts((prev) => ({ ...prev, [order.id]: e.target.value }))
                            }
                            placeholder="أدخل نتائج الفحص والأعطال المكتشفة..."
                            className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                            rows={3}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const notes = inspectionNotesDrafts[order.id] ?? order.inspection_notes ?? "";
                              saveInspectionNotes(order.id, notes);
                              setInspectionNotesDrafts((prev) => {
                                const next = { ...prev };
                                delete next[order.id];
                                return next;
                              });
                            }}
                            className="w-full py-1 text-xs bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-800/70 text-amber-800 dark:text-amber-200 rounded transition"
                          >
                            حفظ الملاحظات
                          </button>
                        </div>
                      )}
                      {((order.items_count ?? 0) > 0 || (order.services_count ?? 0) > 0) && (
                        <div className="text-xs text-emerald-600 mt-1">
                          {(order.items_count ?? 0) > 0 && <span>{order.items_count} قطعة </span>}
                          {(order.services_count ?? 0) > 0 && <span>{order.services_count} خدمة </span>}
                          — {(Number(order.items_total ?? 0) + Number(order.services_total ?? 0)).toFixed(2)} ج.م
                        </div>
                      )}
                      {order.stage === "completed" && order.invoice_number && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">فاتورة: {order.invoice_number}</div>
                      )}
                      {order.order_type === "inspection" && (
                        <div className="text-xs text-amber-600 mt-1 font-medium">فحص قبل البيع/الشراء</div>
                      )}
                      <div className="mt-2 flex flex-col gap-1">
                        {canAddParts(order.stage, order.order_type) && (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setAddPartsOpen(true);
                            }}
                            className="w-full py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition"
                          >
                            إضافة قطعة
                          </button>
                        )}
                        {canAddServices(order.stage, order.order_type) && (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setAddServicesOpen(true);
                            }}
                            className="w-full py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition"
                          >
                            إضافة خدمة
                          </button>
                        )}
                        {order.order_type === "inspection" && (order.stage === "inspection" || order.stage === "ready") && (
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setInspectionChecklistOpen(true);
                            }}
                            className="w-full py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition"
                          >
                            قائمة الفحص
                          </button>
                        )}
                        {next && (
                          <button
                            onClick={() => {
                              const notes =
                                order.stage === "inspection"
                                  ? (inspectionNotesDrafts[order.id] ?? order.inspection_notes ?? "")
                                  : undefined;
                              updateStage(order.id, next.id, notes);
                              if (order.stage === "inspection" && inspectionNotesDrafts[order.id] !== undefined) {
                                setInspectionNotesDrafts((prev) => {
                                  const n = { ...prev };
                                  delete n[order.id];
                                  return n;
                                });
                              }
                            }}
                            className="w-full py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition"
                          >
                            {order.stage === "ready"
                              ? "← إكمال وإصدار الفاتورة"
                              : `← ${next.label}`}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {stageOrders.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">فارغ</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {modalOrderType === "inspection" ? "استلام سيارة للفحص" : "استلام سيارة للصيانة"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {modalOrderType === "inspection"
                  ? "فحص قبل البيع/الشراء — المرحلة الأولى: استلام"
                  : "المرحلة الأولى: استلام"}
              </p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">العميل (ابحث بالاسم أو رقم الهاتف)</label>
                <SearchableSelect
                  options={[
                    { id: "", label: "بدون عميل" },
                    ...customers.map((c) => ({
                      id: c.id,
                      label: c.name,
                      searchText: c.phone ? String(c.phone) : undefined,
                    })),
                  ]}
                  value={form.customer_id}
                  onChange={(id) =>
                    setForm((f) => ({
                      ...f,
                      customer_id: id,
                      vehicle_plate: "",
                      vehicle_model: "",
                      vehicle_year: "",
                      mileage: "",
                    }))
                  }
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  addNewLabel="+ إضافة عميل جديد"
                  addNewFirst
                  onAddNew={() => setAddCustomerOpen(true)}
                  className={inputClass}
                />
              </div>
              {form.customer_id && customerVehicles.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اختر سيارة سابقة (يمكن تعديل البيانات)</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const idx = e.target.value;
                      if (idx === "") return;
                      const v = customerVehicles[Number(idx)];
                      if (v) {
                        setForm((f) => ({
                          ...f,
                          vehicle_plate: v.vehicle_plate,
                          vehicle_model: v.vehicle_model ?? "",
                          vehicle_year: v.vehicle_year ? String(v.vehicle_year) : "",
                          mileage: v.mileage ? String(v.mileage) : "",
                        }));
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="">— إدخال سيارة جديدة —</option>
                    {customerVehicles.map((v, i) => (
                      <option key={v.vehicle_plate} value={i}>
                        {v.vehicle_plate}
                        {v.vehicle_model ? ` — ${v.vehicle_model}` : ""}
                        {v.vehicle_year ? ` (${v.vehicle_year})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">يمكنك تعديل اللوحة أو الموديل إذا بيعت السيارة أو اشتراها عميل آخر</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رقم اللوحة *</label>
                <input
                  type="text"
                  value={form.vehicle_plate}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_plate: e.target.value }))}
                  required
                  className={inputClass}
                  placeholder="أ ب ج 1234"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">موديل السيارة</label>
                <input
                  type="text"
                  value={form.vehicle_model}
                  onChange={(e) => setForm((f) => ({ ...f, vehicle_model: e.target.value }))}
                  className={inputClass}
                  placeholder="تويوتا كورولا"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">سنة الصنع</label>
                  <input
                    type="number"
                    value={form.vehicle_year}
                    onChange={(e) => setForm((f) => ({ ...f, vehicle_year: e.target.value }))}
                    className={inputClass}
                    placeholder="2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الكمية (كم)</label>
                  <input
                    type="number"
                    value={form.mileage}
                    onChange={(e) => setForm((f) => ({ ...f, mileage: e.target.value }))}
                    className={inputClass}
                    placeholder="50000"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                >
                  {saving ? "جاري..." : "استلام"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">إضافة عميل جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الاسم *</label>
                <input
                  type="text"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  placeholder="اسم العميل"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الهاتف</label>
                <input
                  type="text"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                  className={inputClass}
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">البريد</label>
                <input
                  type="email"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  placeholder="email@example.com"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddCustomerOpen(false);
                    setNewCustomerForm({ name: "", phone: "", email: "" });
                  }}
                  className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={(e) => handleAddCustomer(e as unknown as React.FormEvent)}
                  disabled={savingCustomer}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                >
                  {savingCustomer ? "جاري..." : "إضافة"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {addPartsOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">إضافة قطعة - {selectedOrder.order_number}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedOrder.vehicle_plate}</p>
            </div>
            <div className="p-6 space-y-4">
              {orderItems.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">القطع المضافة</h4>
                  <ul className="space-y-1 text-sm text-gray-900 dark:text-gray-100">
                    {orderItems.map((oi) => (
                      <li key={oi.id} className="flex justify-between">
                        <span>{oi.item_name} x {oi.quantity}</span>
                        <span>{oi.total.toFixed(2)} ج.م</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleAddPart} className="space-y-4">
                <InventoryCategoryFilter
                  id="workshop-part-category"
                  loadOnMount={addPartsOpen}
                  value={partCategoryFilter}
                  onChange={setPartCategoryFilter}
                  className="mb-1"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  اختر قسماً لتضييق القائمة، أو اترك «كل الأقسام» وابحث في كل المخزون.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الصنف</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الكمية</label>
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الخصم</label>
                    <div className="flex gap-2">
                      <select value={addForm.discount_type} onChange={(e) => setAddForm((f) => ({ ...f, discount_type: e.target.value as "" | "percent" | "amount" }))} className={inputClass}>
                        <option value="">بدون</option>
                        <option value="percent">نسبة %</option>
                        <option value="amount">مبلغ (ج.م)</option>
                      </select>
                      {(addForm.discount_type === "percent" || addForm.discount_type === "amount") && (
                        <input type="number" min="0" step="any" value={addForm.discount_value} onChange={(e) => setAddForm((f) => ({ ...f, discount_value: e.target.value }))} placeholder={addForm.discount_type === "percent" ? "0-100" : "0"} className={inputClass} />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ضريبة %</label>
                    <input type="number" min="0" max="100" step="any" value={addForm.tax_percent} onChange={(e) => setAddForm((f) => ({ ...f, tax_percent: e.target.value }))} placeholder="0" className={inputClass} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAddPartsOpen(false);
                      setSelectedOrder(null);
                    }}
                    className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    إغلاق
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium rounded-lg transition-colors"
                  >
                    {saving ? "جاري..." : "إضافة"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {addServicesOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">إضافة خدمة - {selectedOrder.order_number}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedOrder.vehicle_plate}</p>
            </div>
            <div className="p-6 space-y-4">
              {orderServices.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">الخدمات المضافة</h4>
                  <ul className="space-y-1 text-sm text-gray-900 dark:text-gray-100">
                    {orderServices.map((s) => (
                      <li key={s.id} className="flex justify-between">
                        <span>{s.description} x {s.quantity}</span>
                        <span>{s.total.toFixed(2)} ج.م</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleAddService} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">وصف الخدمة *</label>
                  <input
                    type="text"
                    value={serviceForm.description}
                    onChange={(e) => setServiceForm((f) => ({ ...f, description: e.target.value }))}
                    required
                    className={inputClass}
                    placeholder="مثال: فحص المحرك، تغيير الزيت، إلخ"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الكمية</label>
                    <input type="number" min="0.01" step="any" value={serviceForm.quantity} onChange={(e) => setServiceForm((f) => ({ ...f, quantity: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">السعر (ج.م)</label>
                    <input type="number" step="any" min="0" value={serviceForm.unit_price} onChange={(e) => setServiceForm((f) => ({ ...f, unit_price: e.target.value }))} className={inputClass} placeholder="0" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الخصم</label>
                    <div className="flex gap-2">
                      <select value={serviceForm.discount_type} onChange={(e) => setServiceForm((f) => ({ ...f, discount_type: e.target.value as "" | "percent" | "amount" }))} className={inputClass}>
                        <option value="">بدون</option>
                        <option value="percent">نسبة %</option>
                        <option value="amount">مبلغ (ج.م)</option>
                      </select>
                      {(serviceForm.discount_type === "percent" || serviceForm.discount_type === "amount") && (
                        <input type="number" min="0" step="any" value={serviceForm.discount_value} onChange={(e) => setServiceForm((f) => ({ ...f, discount_value: e.target.value }))} placeholder={serviceForm.discount_type === "percent" ? "0-100" : "0"} className={inputClass} />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ضريبة %</label>
                    <input type="number" min="0" max="100" step="any" value={serviceForm.tax_percent} onChange={(e) => setServiceForm((f) => ({ ...f, tax_percent: e.target.value }))} placeholder="0" className={inputClass} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAddServicesOpen(false);
                      setSelectedOrder(null);
                    }}
                    className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  >
                    إغلاق
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
                  >
                    {saving ? "جاري..." : "إضافة"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {inspectionChecklistOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">قائمة الفحص - {selectedOrder.order_number}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedOrder.vehicle_plate}</p>
            </div>
            <div className="p-6 space-y-4">
              {checklistItems.map((item) => (
                <div key={item.id} className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.name_ar}</label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={checklistResults[item.id]?.status ?? "na"}
                      onChange={(e) =>
                        setChecklistResults((prev) => ({
                          ...prev,
                          [item.id]: { ...(prev[item.id] ?? { status: "na", notes: "" }), status: e.target.value },
                        }))
                      }
                      className="w-36 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="na">غير مفحوص</option>
                      <option value="ok">سليم</option>
                      <option value="defect">معيب</option>
                      <option value="needs_repair">يحتاج إصلاح</option>
                    </select>
                    <input
                      type="text"
                      value={checklistResults[item.id]?.notes ?? ""}
                      onChange={(e) =>
                        setChecklistResults((prev) => ({
                          ...prev,
                          [item.id]: { ...(prev[item.id] ?? { status: "na", notes: "" }), notes: e.target.value },
                        }))
                      }
                      placeholder="ملاحظات"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-2 items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
                  placeholder="إضافة بند جديد..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={addChecklistItem}
                  disabled={addingItem || !newItemName.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {addingItem ? "..." : "إضافة"}
                </button>
              </div>
              <div className="pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ملاحظات عامة</label>
                <textarea
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="ملاحظات إضافية أو خلاصة التقرير..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setInspectionChecklistOpen(false);
                    setSelectedOrder(null);
                  }}
                  className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={() => selectedOrder && saveInspectionChecklist(selectedOrder.id)}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
                >
                  حفظ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
