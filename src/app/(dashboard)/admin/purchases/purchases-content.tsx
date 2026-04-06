"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InventoryCategoryFilter } from "@/components/inventory/inventory-category-filter";
import { BarcodeScanner } from "@/components/inventory/barcode-scanner";
import { BarcodeTextInput } from "@/components/ui/barcode-text-input";
import { addToQueue } from "@/lib/offline-queue";

interface CartItem {
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface InventoryItem {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
  purchase_price: number;
  sale_price: number;
}

interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
}

type ItemSupplier = { supplier_id: string; supplier_name: string; last_price: number; last_date: string };

const PURCHASE_DRAFT_KEY = "alameen-purchase-draft";

type PurchaseDraftPayload = {
  cart: CartItem[];
  supplierId: string;
  notes: string;
  taxEnabled: boolean;
  taxRate: string;
  discountEnabled: boolean;
  discountType: "percent" | "fixed";
  discountValue: string;
  itemCategoryFilter: string;
};

function loadPurchaseDraft(): Partial<PurchaseDraftPayload> | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(PURCHASE_DRAFT_KEY);
    if (!s) return null;
    return JSON.parse(s) as Partial<PurchaseDraftPayload>;
  } catch {
    return null;
  }
}

function savePurchaseDraft(data: PurchaseDraftPayload) {
  if (typeof window === "undefined") return;
  try {
    const hasProgress =
      data.cart.length > 0 ||
      Boolean(data.supplierId) ||
      Boolean(data.notes?.trim()) ||
      data.taxEnabled ||
      data.discountEnabled;
    if (!hasProgress) {
      localStorage.removeItem(PURCHASE_DRAFT_KEY);
      return;
    }
    localStorage.setItem(PURCHASE_DRAFT_KEY, JSON.stringify(data));
  } catch {}
}

function clearPurchaseDraft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PURCHASE_DRAFT_KEY);
  } catch {}
}

export function PurchasesContent({
  initialItemId,
  initialQty,
  initialSupplierId,
}: {
  initialItemId?: string;
  initialQty?: string;
  initialSupplierId?: string;
} = {}) {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itemSuppliers, setItemSuppliers] = useState<ItemSupplier[]>([]);
  const [showSupplierCompare, setShowSupplierCompare] = useState(false);
  const initialApplied = useRef(false);
  /** لا نحفظ/نمسح مسودة الشراء أثناء إضافة صنف من رابط ?item= حتى يكتمل التوجيه */
  const [allowPurchaseDraftPersist, setAllowPurchaseDraftPersist] = useState(() => !initialItemId);
  const newProductBarcodeRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("14");
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ id: string; invoice_number: string } | null>(null);

  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState("1");
  const [addPrice, setAddPrice] = useState("");

  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({ name: "", phone: "", email: "" });
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: "",
    code: "",
    barcode: "",
    category: "",
    unit: "قطعة",
    purchase_price: "",
    sale_price: "",
    quantity: "1",
    min_quantity_enabled: false,
    min_quantity: "",
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);

  const [itemCategoryFilter, setItemCategoryFilter] = useState("");

  async function fetchData() {
    try {
      const itemsUrl = `/api/admin/inventory/items?limit=500&offset=0${itemCategoryFilter ? `&category=${encodeURIComponent(itemCategoryFilter)}` : ""}`;
      const [itemsRes, suppliersRes] = await Promise.all([
        fetch(itemsUrl),
        fetch("/api/admin/suppliers?limit=500&offset=0"),
      ]);
      if (itemsRes.ok) {
        const d = await itemsRes.json();
        setItems(Array.isArray(d) ? d : (d.items ?? []));
      }
      if (suppliersRes.ok) {
        const d = await suppliersRes.json();
        setSuppliers(Array.isArray(d) ? d : (d.suppliers ?? []));
      }
    } catch {}
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/admin/inventory/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setUnits(data.units || []);
      }
    } catch {}
  }

  useEffect(() => {
    fetchData();
  }, [itemCategoryFilter]);

  useEffect(() => {
    setAddItemId("");
  }, [itemCategoryFilter]);

  useEffect(() => {
    if (!addProductOpen || showBarcodeScanner) return;
    const id = window.setTimeout(() => newProductBarcodeRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [addProductOpen, showBarcodeScanner]);

  useEffect(() => {
    const handleOnline = () => fetchData();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, []);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  useEffect(() => {
    if (!initialItemId) return;
    setDraftLoaded(true);
  }, [initialItemId]);

  useEffect(() => {
    if (initialItemId || items.length === 0 || draftLoaded) return;
    const draft = loadPurchaseDraft();
    if (!draft?.cart?.length && !draft?.supplierId && !draft?.notes?.trim() && !draft?.taxEnabled && !draft?.discountEnabled) {
      setDraftLoaded(true);
      return;
    }
    const merged: CartItem[] = [];
    if (draft.cart?.length) {
      for (const c of draft.cart) {
        const item = items.find((i) => i.id === c.item_id);
        if (!item) continue;
        const qty = Math.max(0.01, Number(c.quantity) || 0.01);
        const unit = Number.isFinite(Number(c.unit_price)) && Number(c.unit_price) >= 0 ? Number(c.unit_price) : item.purchase_price;
        merged.push({
          item_id: item.id,
          name: item.name,
          quantity: qty,
          unit_price: unit,
          total: qty * unit,
        });
      }
    }
    if (merged.length > 0) setCart(merged);
    if (draft.supplierId) setSupplierId(draft.supplierId);
    if (draft.notes) setNotes(draft.notes);
    if (draft.taxEnabled) setTaxEnabled(true);
    if (draft.taxRate) setTaxRate(draft.taxRate);
    if (draft.discountEnabled) setDiscountEnabled(true);
    if (draft.discountType) setDiscountType(draft.discountType);
    if (draft.discountValue) setDiscountValue(draft.discountValue);
    if (draft.itemCategoryFilter !== undefined && draft.itemCategoryFilter !== "") {
      setItemCategoryFilter(draft.itemCategoryFilter);
    }
    if (merged.length > 0 || draft.supplierId || draft.notes?.trim() || draft.taxEnabled || draft.discountEnabled) {
      setRestoredFromDraft(true);
    }
    setDraftLoaded(true);
  }, [items.length, draftLoaded, initialItemId]);

  useEffect(() => {
    if (!draftLoaded || !allowPurchaseDraftPersist) return;
    savePurchaseDraft({
      cart,
      supplierId,
      notes,
      taxEnabled,
      taxRate,
      discountEnabled,
      discountType,
      discountValue,
      itemCategoryFilter,
    });
  }, [
    draftLoaded,
    allowPurchaseDraftPersist,
    cart,
    supplierId,
    notes,
    taxEnabled,
    taxRate,
    discountEnabled,
    discountType,
    discountValue,
    itemCategoryFilter,
  ]);

  useEffect(() => {
    if (addProductOpen) fetchCategories();
  }, [addProductOpen]);

  useEffect(() => {
    if (initialApplied.current || !initialItemId || items.length === 0) return;
    const item = items.find((i) => i.id === initialItemId);
    if (!item) {
      initialApplied.current = true;
      setAllowPurchaseDraftPersist(true);
      return;
    }
    initialApplied.current = true;

    const qty = Math.max(1, Number(initialQty) || 1);
    setAddItemId(initialItemId);
    setAddQty(String(qty));
    setAddPrice(String(item.purchase_price));

    fetch(`/api/admin/inventory/items/${initialItemId}/suppliers`)
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((data: { suppliers: ItemSupplier[] }) => {
        const list = data.suppliers || [];
        setItemSuppliers(list);
        const first = list[0];
        const price = first?.last_price ?? item.purchase_price;
        if (first) {
          setSupplierId(initialSupplierId && list.some((s) => s.supplier_id === initialSupplierId) ? initialSupplierId : first.supplier_id);
          setAddPrice(String(price));
        }
        setCart((prev) => {
          const existing = prev.find((c) => c.item_id === item.id);
          if (existing) {
            const newQty = existing.quantity + qty;
            const newPrice = (existing.quantity * existing.unit_price + qty * price) / newQty;
            return prev.map((c) =>
              c.item_id === item.id ? { ...c, quantity: newQty, unit_price: newPrice, total: newQty * newPrice } : c
            );
          }
          return [...prev, { item_id: item.id, name: item.name, quantity: qty, unit_price: price, total: qty * price }];
        });
      })
      .catch(() => {
        setCart((prev) => {
          const existing = prev.find((c) => c.item_id === item.id);
          const price = item.purchase_price;
          if (existing) {
            const newQty = existing.quantity + qty;
            const newPrice = (existing.quantity * existing.unit_price + qty * price) / newQty;
            return prev.map((c) =>
              c.item_id === item.id ? { ...c, quantity: newQty, unit_price: newPrice, total: newQty * newPrice } : c
            );
          }
          return [...prev, { item_id: item.id, name: item.name, quantity: qty, unit_price: price, total: qty * price }];
        });
      })
      .finally(() => {
        router.replace("/admin/purchases", { scroll: false });
        setAllowPurchaseDraftPersist(true);
      });
  }, [items, initialItemId, initialQty, initialSupplierId, router]);


  function addToCart() {
    const item = items.find((i) => i.id === addItemId);
    if (!item || Number(addQty) <= 0) return;

    const qty = Number(addQty);
    const price = Number(addPrice) || item.purchase_price;
    if (price > item.sale_price) {
      if (!confirm("⚠️ تنبيه خسارة: سعر الشراء المدخل أعلى من سعر البيع للصنف. هل تريد المتابعة؟")) {
        return;
      }
    }
    const total = qty * price;

    const existing = cart.find((c) => c.item_id === item.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      const newPrice = (existing.quantity * existing.unit_price + total) / newQty;
      setCart((prev) =>
        prev.map((c) =>
          c.item_id === item.id
            ? { ...c, quantity: newQty, unit_price: newPrice, total: newQty * newPrice }
            : c
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          item_id: item.id,
          name: item.name,
          quantity: qty,
          unit_price: price,
          total,
        },
      ]);
    }
    setAddItemId("");
    setAddQty("1");
    setAddPrice("");
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.item_id !== itemId));
  }

  function updateCartItem(itemId: string, qty: number, price: number) {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    const item = items.find((i) => i.id === itemId);
    if (item && price > 0 && item.sale_price > 0 && price > item.sale_price) {
      if (!confirm("⚠️ تنبيه خسارة: سعر الشراء أعلى من سعر البيع. هل تريد المتابعة؟")) {
        return;
      }
    }
    setCart((prev) =>
      prev.map((c) =>
        c.item_id === itemId
          ? { ...c, quantity: qty, unit_price: price, total: qty * price }
          : c
      )
    );
  }

  const subtotal = cart.reduce((sum, c) => sum + c.total, 0);
  const discountAmount = discountEnabled
    ? discountType === "percent"
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0
    : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxEnabled ? (afterDiscount * (Number(taxRate) || 0)) / 100 : 0;
  const total = afterDiscount + taxAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      alert("أضف أصنافاً للفاتورة");
      return;
    }

    const payload = {
      supplier_id: supplierId || undefined,
      items: cart.map((c) => ({
        item_id: c.item_id,
        quantity: c.quantity,
        unit_price: c.unit_price,
      })),
      notes: notes.trim() || undefined,
      discount: discountEnabled ? discountAmount : 0,
      tax: taxEnabled ? taxAmount : 0,
    };

    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "create_purchase_invoice", data: payload });
        setCart([]);
        setSupplierId("");
        setNotes("");
        setTaxEnabled(false);
        setDiscountEnabled(false);
        setDiscountValue("");
        clearPurchaseDraft();
        alert("انقطع الاتصال. تم حفظ فاتورة الشراء محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        return;
      }

      const res = await fetch("/api/admin/invoices/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إنشاء فاتورة الشراء");
        return;
      }

      const data = await res.json();
      setLastInvoice({ id: data.id, invoice_number: data.invoice_number });
      setCart([]);
      setSupplierId("");
      setNotes("");
      setTaxEnabled(false);
      setDiscountEnabled(false);
      setDiscountValue("");
      clearPurchaseDraft();
      fetchData();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "create_purchase_invoice", data: payload });
        setCart([]);
        setSupplierId("");
        setNotes("");
        setTaxEnabled(false);
        setDiscountEnabled(false);
        setDiscountValue("");
        clearPurchaseDraft();
        alert("انقطع الاتصال. تم حفظ فاتورة الشراء محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ. حاول مرة أخرى.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!newSupplierForm.name.trim()) {
      alert("اسم المورد مطلوب");
      return;
    }
    const payload = {
      name: newSupplierForm.name.trim(),
      phone: newSupplierForm.phone.trim() || undefined,
      email: newSupplierForm.email.trim() || undefined,
    };
    setSavingSupplier(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "add_supplier", data: payload });
        setAddSupplierOpen(false);
        setNewSupplierForm({ name: "", phone: "", email: "" });
        alert("انقطع الاتصال. تم حفظ المورد محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إضافة المورد");
        return;
      }
      const newSupplier = await res.json();
      setSuppliers((prev) => [{ id: newSupplier.id, name: newSupplier.name }, ...prev]);
      setSupplierId(newSupplier.id);
      setAddSupplierOpen(false);
      setNewSupplierForm({ name: "", phone: "", email: "" });
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "add_supplier", data: payload });
        setAddSupplierOpen(false);
        setNewSupplierForm({ name: "", phone: "", email: "" });
        alert("انقطع الاتصال. تم حفظ المورد محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setSavingSupplier(false);
    }
  }

  function resetProductForm() {
    setNewProductForm({
      name: "",
      code: "",
      barcode: "",
      category: "",
      unit: "قطعة",
      purchase_price: "",
      sale_price: "",
      quantity: "1",
      min_quantity_enabled: false,
      min_quantity: "",
    });
    setNewCategory("");
    setNewUnit("");
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProductForm.name.trim()) {
      alert("اسم الصنف مطلوب");
      return;
    }
    const purchasePrice = Number(newProductForm.purchase_price) || 0;
    const salePrice = Number(newProductForm.sale_price) || purchasePrice;
    if (purchasePrice > 0 && salePrice < purchasePrice) {
      if (!confirm("⚠️ تنبيه خسارة: سعر البيع أقل من سعر الشراء. هل تريد المتابعة؟")) {
        return;
      }
    }
    setSavingProduct(true);
    try {
      const payload = {
        name: newProductForm.name.trim(),
        code: newProductForm.code.trim() || undefined,
        barcode: newProductForm.barcode.trim() || undefined,
        category: (newProductForm.category === "__new__" ? newCategory : newProductForm.category)?.trim() || undefined,
        unit: (newProductForm.unit === "__new__" ? newUnit : newProductForm.unit)?.trim() || "قطعة",
        purchase_price: Number(newProductForm.purchase_price) || 0,
        sale_price: Number(newProductForm.sale_price) || Number(newProductForm.purchase_price) || 0,
        min_quantity_enabled: newProductForm.min_quantity_enabled,
        min_quantity: newProductForm.min_quantity_enabled ? Number(newProductForm.min_quantity) || 0 : 0,
      };
      if (!navigator.onLine) {
        addToQueue({ type: "create_inventory_item", data: payload });
        setAddProductOpen(false);
        resetProductForm();
        alert("انقطع الاتصال. تم حفظ طلب إضافة الصنف. سيتم إنشاؤه تلقائياً عند عودة الإنترنت. أضفه لفاتورة الشراء بعد العودة.");
        return;
      }
      const res = await fetch("/api/admin/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إضافة الصنف");
        return;
      }
      const newItem = await res.json();
      await fetchData();
      setAddItemId(newItem.id);
      setAddPrice(String(newItem.purchase_price ?? 0));
      setAddProductOpen(false);
      resetProductForm();
      setAddQty("1");
      const price = Number(newProductForm.purchase_price) || Number(newItem.purchase_price) || 0;
      const qty = Number(newProductForm.quantity) || 1;
      setCart((prev) => {
        const existing = prev.find((c) => c.item_id === newItem.id);
        if (existing) {
          const newQty = existing.quantity + qty;
          const newPrice = (existing.quantity * existing.unit_price + qty * price) / newQty;
          return prev.map((c) =>
            c.item_id === newItem.id ? { ...c, quantity: newQty, unit_price: newPrice, total: newQty * newPrice } : c
          );
        }
        return [...prev, { item_id: newItem.id, name: newItem.name, quantity: qty, unit_price: price, total: qty * price }];
      });
    } catch {
      if (!navigator.onLine) {
        addToQueue({
          type: "create_inventory_item",
          data: {
            name: newProductForm.name.trim(),
            code: newProductForm.code.trim() || undefined,
            barcode: newProductForm.barcode.trim() || undefined,
            category: (newProductForm.category === "__new__" ? newCategory : newProductForm.category)?.trim() || undefined,
            unit: (newProductForm.unit === "__new__" ? newUnit : newProductForm.unit)?.trim() || "قطعة",
            purchase_price: Number(newProductForm.purchase_price) || 0,
            sale_price: Number(newProductForm.sale_price) || Number(newProductForm.purchase_price) || 0,
            min_quantity_enabled: newProductForm.min_quantity_enabled,
            min_quantity: newProductForm.min_quantity_enabled ? Number(newProductForm.min_quantity) || 0 : 0,
          },
        });
        setAddProductOpen(false);
        resetProductForm();
        alert("انقطع الاتصال. تم حفظ طلب إضافة الصنف. سيتم إنشاؤه تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setSavingProduct(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-gray-900 mb-4">إضافة صنف</h2>
          <div className="flex flex-wrap gap-2 items-end mb-2">
            <InventoryCategoryFilter
              id="purchase-item-category"
              loadOnMount
              value={itemCategoryFilter}
              onChange={setItemCategoryFilter}
              className="w-44"
            />
            <p className="text-xs text-gray-500 pb-1">«كل الأقسام» يعرض كل الأصناف للبحث.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">الصنف (ابحث بالاسم أو الكود)</label>
              <SearchableSelect
                options={items.map((i) => ({
                  id: i.id,
                  label: i.name,
                  searchText: [i.code, i.category, i.name].filter(Boolean).join(" "),
                }))}
                value={addItemId}
                onChange={(id) => {
                  setAddItemId(id);
                  const item = items.find((i) => i.id === id);
                  if (item) setAddPrice(String(item.purchase_price));
                  setItemSuppliers([]);
                }}
                placeholder="ابحث بالاسم أو الكود..."
                addNewLabel="+ إضافة صنف جديد"
                addNewFirst
                onAddNew={() => {
                  setAddProductOpen(true);
                  setAddItemId("");
                }}
                className={inputClass}
              />
              {addItemId && (
                <button
                  type="button"
                  onClick={async () => {
                    const r = await fetch(`/api/admin/inventory/items/${addItemId}/suppliers`);
                    const data = r.ok ? await r.json() : { suppliers: [] };
                    setItemSuppliers(data.suppliers || []);
                    setShowSupplierCompare(true);
                  }}
                  className="mt-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                >
                  مقارنة أسعار التجار
                </button>
              )}
            </div>
            <div className="w-24">
              <label className="block text-xs text-gray-500 mb-1">الكمية</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs text-gray-500 mb-1">سعر الشراء</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900"
                placeholder="0"
              />
              {addItemId && (() => {
                const it = items.find((i) => i.id === addItemId);
                const p = Number(addPrice) || 0;
                return it && p > 0 && it.sale_price > 0 && p > it.sale_price ? (
                  <p className="mt-1 text-xs text-red-600 font-medium">⚠️ خسارة: أعلى من سعر البيع</p>
                ) : null;
              })()}
            </div>
            <button
              type="button"
              onClick={addToCart}
              disabled={!addItemId}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
            >
              إضافة
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center gap-2">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">بنود الفاتورة ({cart.length})</h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("مسح مسودة فاتورة الشراء والبدء من جديد؟")) {
                    setCart([]);
                    setSupplierId("");
                    setNotes("");
                    setTaxEnabled(false);
                    setDiscountEnabled(false);
                    setDiscountValue("");
                    clearPurchaseDraft();
                    setRestoredFromDraft(false);
                  }
                }}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 shrink-0"
              >
                مسح المسودة
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-gray-500">فارغ</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {cart.map((c) => (
                  <li key={c.item_id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{c.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={c.quantity}
                          onChange={(e) => updateCartItem(c.item_id, Number(e.target.value), c.unit_price)}
                          className="w-20 px-2 py-1 text-sm rounded border border-gray-300"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={c.unit_price}
                          onChange={(e) => updateCartItem(c.item_id, c.quantity, Number(e.target.value))}
                          className="w-24 px-2 py-1 text-sm rounded border border-gray-300"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{c.total.toFixed(2)} ج.م</span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(c.item_id)}
                        className="text-red-600 hover:text-red-700 text-sm"
                      >
                        حذف
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إنشاء فاتورة شراء</h2>

        {restoredFromDraft && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
            تم استعادة مسودة فاتورة الشراء. يمكنك إكمال الفاتورة أو مسح المسودة من أعلى قائمة البنود.
          </div>
        )}

        {lastInvoice && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-emerald-800 font-medium">تم إنشاء الفاتورة بنجاح</p>
            <Link
              href={`/admin/invoices/${lastInvoice.id}`}
              className="text-emerald-600 hover:text-emerald-700 font-medium mt-1 inline-block"
            >
              {lastInvoice.invoice_number} — عرض الفاتورة
            </Link>
          </div>
        )}

        <form id="purchase-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المورد (ابحث بالاسم أو رقم الهاتف)</label>
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
              onChange={(id) => {
                if (id === "__new__") return;
                setSupplierId(id);
              }}
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              addNewLabel="+ إضافة مورد جديد"
              addNewFirst
              onAddNew={() => setAddSupplierOpen(true)}
              className={inputClass}
            />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between text-gray-700">
              <span>المجموع الفرعي</span>
              <span>{subtotal.toFixed(2)} ج.م</span>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={discountEnabled}
                  onChange={(e) => setDiscountEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600"
                />
                <span className="text-sm font-medium text-gray-700">تفعيل الخصم</span>
              </label>
            </div>
            {discountEnabled && (
              <div className="flex gap-2 items-center">
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  <option value="percent">نسبة مئوية %</option>
                  <option value="fixed">مبلغ ثابت (ج.م)</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  placeholder={discountType === "percent" ? "مثال: 10" : "مثال: 500"}
                />
                <span className="text-sm text-gray-500">
                  {discountType === "percent" ? "%" : "ج.م"} = {discountAmount.toFixed(2)} ج.م
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={(e) => setTaxEnabled(e.target.checked)}
                  className="rounded border-gray-300 text-emerald-600"
                />
                <span className="text-sm font-medium text-gray-700">تفعيل الضريبة</span>
              </label>
            </div>
            {taxEnabled && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-600">نسبة الضريبة</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-20 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
                <span className="text-sm text-gray-500">%</span>
                <span className="text-sm text-gray-500">= {taxAmount.toFixed(2)} ج.م (على {afterDiscount.toFixed(2)} ج.م)</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
              <span>الإجمالي النهائي</span>
              <span className="text-emerald-600">{total.toFixed(2)} ج.م</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              rows={2}
              placeholder="ملاحظات..."
            />
          </div>

          <button
            type="submit"
            disabled={saving || cart.length === 0}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold rounded-lg transition-colors"
          >
            {saving ? "جاري الإنشاء..." : "إنشاء فاتورة شراء"}
          </button>
        </form>
      </div>
    </div>

    {addSupplierOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">إضافة مورد جديد</h3>
          <form onSubmit={handleAddSupplier} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم *</label>
              <input
                type="text"
                value={newSupplierForm.name}
                onChange={(e) => setNewSupplierForm((f) => ({ ...f, name: e.target.value }))}
                required
                className={inputClass}
                placeholder="اسم المورد"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الهاتف</label>
              <input
                type="text"
                value={newSupplierForm.phone}
                onChange={(e) => setNewSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
                placeholder="01xxxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد</label>
              <input
                type="email"
                value={newSupplierForm.email}
                onChange={(e) => setNewSupplierForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
                placeholder="email@example.com"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAddSupplierOpen(false);
                  setNewSupplierForm({ name: "", phone: "", email: "" });
                }}
                className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingSupplier}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
              >
                {savingSupplier ? "جاري..." : "إضافة"}
              </button>
            </div>
          </form>
              </div>
            </div>
          )}

          {addProductOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">إضافة صنف جديد</h3>
                <form onSubmit={handleAddProduct} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">اسم القطعة *</label>
                    <input
                      type="text"
                      value={newProductForm.name}
                      onChange={(e) => setNewProductForm((f) => ({ ...f, name: e.target.value }))}
                      required
                      className={inputClass}
                      placeholder="مثال: زيت محرك 5W30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الكود (تلقائي إن تُرك فارغاً)</label>
                    <input
                      type="text"
                      value={newProductForm.code}
                      onChange={(e) => setNewProductForm((f) => ({ ...f, code: e.target.value }))}
                      className={inputClass}
                      placeholder="مثال: OIL-001 أو اتركه للتوليد التلقائي"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الباركود (تلقائي إن تُرك فارغاً)</label>
                    <p className="text-xs text-gray-500 mb-1">انقر في الخانة ثم امسح بالماسح الضوئي (أو «مسح» للكاميرا).</p>
                    <div className="flex gap-2">
                      <BarcodeTextInput
                        ref={newProductBarcodeRef}
                        value={newProductForm.barcode}
                        onChange={(e) => setNewProductForm((f) => ({ ...f, barcode: e.target.value }))}
                        className={inputClass}
                        placeholder="امسح أو اكتب الباركود"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBarcodeScanner(true)}
                        className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg shrink-0"
                        title="مسح بالكاميرا"
                      >
                        📷 مسح
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">القسم</label>
                    <select
                      value={newProductForm.category}
                      onChange={(e) => {
                        setNewProductForm((f) => ({ ...f, category: e.target.value }));
                        if (e.target.value === "__new__") setNewCategory("");
                      }}
                      className={inputClass}
                    >
                      <option value="">اختر القسم</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__new__">+ إضافة قسم جديد</option>
                    </select>
                    {newProductForm.category === "__new__" && (
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className={`${inputClass} mt-2`}
                        placeholder="اسم القسم الجديد"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الوحدة</label>
                    <select
                      value={newProductForm.unit}
                      onChange={(e) => {
                        setNewProductForm((f) => ({ ...f, unit: e.target.value }));
                        if (e.target.value === "__new__") setNewUnit("");
                      }}
                      className={inputClass}
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                      <option value="__new__">+ إضافة وحدة جديدة</option>
                    </select>
                    {newProductForm.unit === "__new__" && (
                      <input
                        type="text"
                        value={newUnit}
                        onChange={(e) => setNewUnit(e.target.value)}
                        className={`${inputClass} mt-2`}
                        placeholder="اسم الوحدة الجديدة"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newProductForm.min_quantity_enabled}
                        onChange={(e) => setNewProductForm((f) => ({ ...f, min_quantity_enabled: e.target.checked }))}
                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-gray-700">تفعيل تنبيه الحد الأدنى</span>
                    </label>
                  </div>
                  {newProductForm.min_quantity_enabled && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأدنى للكمية</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newProductForm.min_quantity}
                        onChange={(e) => setNewProductForm((f) => ({ ...f, min_quantity: e.target.value }))}
                        className={inputClass}
                        placeholder="مثال: 5"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الكمية للفاتورة</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={newProductForm.quantity}
                      onChange={(e) => setNewProductForm((f) => ({ ...f, quantity: e.target.value }))}
                      className={inputClass}
                      placeholder="1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">سعر الشراء (ج.م)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newProductForm.purchase_price}
                        onChange={(e) => setNewProductForm((f) => ({ ...f, purchase_price: e.target.value }))}
                        className={inputClass}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع (ج.م)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newProductForm.sale_price}
                        onChange={(e) => setNewProductForm((f) => ({ ...f, sale_price: e.target.value }))}
                        className={inputClass}
                        placeholder="0"
                      />
                      {Number(newProductForm.purchase_price) > 0 && Number(newProductForm.sale_price) > 0 && Number(newProductForm.sale_price) < Number(newProductForm.purchase_price) && (
                        <p className="mt-1 text-sm text-red-600 font-medium">⚠️ تنبيه خسارة: سعر البيع أقل من سعر الشراء</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setAddProductOpen(false);
                        resetProductForm();
                      }}
                      className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={savingProduct}
                      className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                    >
                      {savingProduct ? "جاري..." : "حفظ"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

      {showBarcodeScanner && (
        <BarcodeScanner
          onScan={(value) => {
            setNewProductForm((f) => ({ ...f, barcode: value }));
            setShowBarcodeScanner(false);
          }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      {showSupplierCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">مقارنة أسعار التجار</h3>
              <button
                type="button"
                onClick={() => setShowSupplierCompare(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {itemSuppliers.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">لا يوجد سجل شراء سابق لهذا الصنف من أي مورد</p>
              ) : (
                <ul className="space-y-2">
                  {itemSuppliers.map((s) => (
                    <li
                      key={s.supplier_id}
                      className="flex justify-between items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => {
                        setSupplierId(s.supplier_id);
                        setAddPrice(String(s.last_price));
                        setShowSupplierCompare(false);
                      }}
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{s.supplier_name}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">{s.last_price.toFixed(2)} ج.م</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
