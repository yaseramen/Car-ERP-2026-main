"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { InventoryCategoryFilter } from "@/components/inventory/inventory-category-filter";
import { BarcodeScanner } from "@/components/inventory/barcode-scanner";
import { addToQueue } from "@/lib/offline-queue";
import { DigitalWalletPaymentFields } from "@/components/payment/digital-wallet-fields";

interface CartItem {
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  /** سعر الشراء — يُملأ لمالك المركز فقط (لا يُرسل للخادم) */
  purchase_price?: number;
}

interface InventoryItem {
  id: string;
  name: string;
  code?: string | null;
  barcode?: string | null;
  category?: string | null;
  quantity: number;
  sale_price: number;
  purchase_price?: number;
}

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
}

interface PaymentMethod {
  id: string;
  name: string;
  type?: string;
}

const CASHIER_DRAFT_KEY = "alameen-cashier-draft";

function loadCashierDraft(): Partial<{
  cart: CartItem[];
  customerId: string;
  paymentMethodId: string;
  paidAmount: string;
  referenceFrom: string;
  referenceTo: string;
  notes: string;
  taxEnabled: boolean;
  taxRate: string;
  discountEnabled: boolean;
  discountType: "percent" | "fixed";
  discountValue: string;
}> | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(CASHIER_DRAFT_KEY);
    if (!s) return null;
    return JSON.parse(s) as ReturnType<typeof loadCashierDraft>;
  } catch {
    return null;
  }
}

function saveCashierDraft(data: {
  cart: CartItem[];
  customerId: string;
  paymentMethodId: string;
  paidAmount: string;
  referenceFrom: string;
  referenceTo: string;
  notes: string;
  taxEnabled: boolean;
  taxRate: string;
  discountEnabled: boolean;
  discountType: "percent" | "fixed";
  discountValue: string;
}) {
  if (typeof window === "undefined") return;
  try {
    if (data.cart.length === 0) return;
    localStorage.setItem(CASHIER_DRAFT_KEY, JSON.stringify(data));
  } catch {}
}

function clearCashierDraft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CASHIER_DRAFT_KEY);
  } catch {}
}

interface CashierContentProps {
  /** يظهر سعر الشراء في الكاشير لمساعدة المالك على تجنب البيع بخسارة */
  showPurchaseCost?: boolean;
}

export function CashierContent({ showPurchaseCost = false }: CashierContentProps) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [referenceFrom, setReferenceFrom] = useState("");
  const [referenceTo, setReferenceTo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ id: string; invoice_number: string } | null>(null);

  const [distInfo, setDistInfo] = useState<{
    warehouse_name: string;
    treasury_balance: number;
  } | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNotes, setSettleNotes] = useState("");
  const [settling, setSettling] = useState(false);

  const [feeConfig, setFeeConfig] = useState<{ rate: number; minFee: number }>({ rate: 0.0001, minFee: 0.5 });
  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState("1");

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", email: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("14");
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");

  const [itemCategoryFilter, setItemCategoryFilter] = useState("");

  async function fetchData() {
    try {
      const itemsUrl = `/api/admin/inventory/items?limit=2500&offset=0${itemCategoryFilter ? `&category=${encodeURIComponent(itemCategoryFilter)}` : ""}`;
      const [itemsRes, customersRes, methodsRes, feeRes, distRes] = await Promise.all([
        fetch(itemsUrl),
        fetch("/api/admin/customers?limit=500&offset=0"),
        fetch("/api/admin/payment-methods"),
        fetch("/api/admin/digital-fee"),
        fetch("/api/admin/me/distribution"),
      ]);
      if (itemsRes.ok) {
        const d = await itemsRes.json();
        setItems(Array.isArray(d) ? d : (d.items ?? []));
      }
      if (customersRes.ok) {
        const d = await customersRes.json();
        setCustomers(Array.isArray(d) ? d : (d.customers ?? []));
      }
      if (methodsRes.ok) setPaymentMethods(await methodsRes.json());
      if (feeRes.ok) {
        const d = await feeRes.json();
        setFeeConfig({ rate: Number(d.rate ?? 0.0001), minFee: Number(d.minFee ?? 0.5) });
      }
      if (distRes.ok) {
        const d = await distRes.json();
        if (d.distribution) {
          setDistInfo({
            warehouse_name: d.distribution.warehouse_name,
            treasury_balance: Number(d.distribution.treasury_balance ?? 0),
          });
        } else {
          setDistInfo(null);
        }
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
    const handleOnline = () => fetchData();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, []);

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);
  useEffect(() => {
    if (items.length === 0 || draftLoaded) return;
    const draft = loadCashierDraft();
    if (!draft?.cart?.length) {
      setDraftLoaded(true);
      return;
    }
    const merged: CartItem[] = [];
    for (const c of draft.cart) {
      const item = items.find((i) => i.id === c.item_id);
      if (!item || item.quantity <= 0) continue;
      const qty = Math.min(c.quantity, item.quantity);
      merged.push({
        item_id: item.id,
        name: item.name,
        quantity: qty,
        unit_price: item.sale_price,
        total: qty * item.sale_price,
        purchase_price:
          showPurchaseCost && item.purchase_price != null && Number.isFinite(Number(item.purchase_price))
            ? Number(item.purchase_price)
            : undefined,
      });
    }
    if (merged.length > 0) {
      setCart(merged);
      if (draft.customerId) setCustomerId(draft.customerId);
      if (draft.paymentMethodId) setPaymentMethodId(draft.paymentMethodId);
      if (draft.paidAmount) setPaidAmount(draft.paidAmount);
      if (draft.referenceFrom) setReferenceFrom(draft.referenceFrom);
      if (draft.referenceTo) setReferenceTo(draft.referenceTo);
      if (draft.notes) setNotes(draft.notes);
      if (draft.taxEnabled) setTaxEnabled(true);
      if (draft.taxRate) setTaxRate(draft.taxRate);
      if (draft.discountEnabled) setDiscountEnabled(true);
      if (draft.discountType) setDiscountType(draft.discountType);
      if (draft.discountValue) setDiscountValue(draft.discountValue);
      setRestoredFromDraft(true);
    }
    setDraftLoaded(true);
  }, [items.length, draftLoaded, showPurchaseCost]);

  useEffect(() => {
    saveCashierDraft({
      cart,
      customerId,
      paymentMethodId,
      paidAmount,
      referenceFrom,
      referenceTo,
      notes,
      taxEnabled,
      taxRate,
      discountEnabled,
      discountType,
      discountValue,
    });
  }, [cart, customerId, paymentMethodId, paidAmount, referenceFrom, referenceTo, notes, taxEnabled, taxRate, discountEnabled, discountType, discountValue]);

  function findItemByBarcodeOrCode(value: string): InventoryItem | undefined {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return undefined;
    return items.find(
      (i) =>
        i.quantity > 0 &&
        ((i.barcode && String(i.barcode).trim().toLowerCase() === v) ||
          (i.code && String(i.code).trim().toLowerCase() === v))
    );
  }

  async function findItemByBarcodeOrCodeRemote(value: string): Promise<InventoryItem | undefined> {
    const local = findItemByBarcodeOrCode(value);
    if (local) return local;
    const v = String(value || "").trim();
    if (!v) return undefined;
    try {
      const res = await fetch(`/api/admin/inventory/items?limit=50&offset=0&search=${encodeURIComponent(v)}`);
      if (!res.ok) return undefined;
      const d = await res.json();
      const list: InventoryItem[] = Array.isArray(d) ? d : (d.items ?? []);
      const vl = v.toLowerCase();
      return list.find(
        (i) =>
          i.quantity > 0 &&
          ((i.barcode && String(i.barcode).trim().toLowerCase() === vl) ||
            (i.code && String(i.code).trim().toLowerCase() === vl))
      );
    } catch {
      return undefined;
    }
  }

  const itemToCashierOption = useCallback(
    (i: InventoryItem) => {
      const salePart = `بيع ${i.sale_price.toFixed(2)} ج.م`;
      const pur =
        showPurchaseCost &&
        i.purchase_price != null &&
        Number.isFinite(Number(i.purchase_price)) &&
        Number(i.purchase_price) > 0
          ? ` • شراء ${Number(i.purchase_price).toFixed(2)} ج.م`
          : showPurchaseCost
            ? " • شراء —"
            : "";
      const label = `${i.name} (متاح: ${i.quantity}) — ${salePart}${pur}`;
      return {
        id: i.id,
        label,
        searchText: [i.code, i.barcode, i.category, i.name].filter(Boolean).join(" "),
      };
    },
    [showPurchaseCost]
  );

  /** دمج نتائج البحث من الخادم حتى يُختار صنف لم يكن ضمن أول دفعة محمّلة */
  const cashierRemoteSearch = useCallback(
    async (q: string) => {
      const qs = q.trim();
      if (!qs) return [];
      const cat = itemCategoryFilter ? `&category=${encodeURIComponent(itemCategoryFilter)}` : "";
      try {
        const res = await fetch(`/api/admin/inventory/items?limit=120&offset=0&search=${encodeURIComponent(qs)}${cat}`);
        if (!res.ok) return [];
        const d = await res.json();
        const list: InventoryItem[] = Array.isArray(d) ? d : (d.items ?? []);
        const withStock = list.filter((i) => i.quantity > 0);
        setItems((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          for (const it of withStock) {
            byId.set(it.id, it);
          }
          return Array.from(byId.values());
        });
        return withStock.map(itemToCashierOption);
      } catch {
        return [];
      }
    },
    [itemCategoryFilter, itemToCashierOption]
  );

  const addToCart = useCallback(() => {
    const item = items.find((i) => i.id === addItemId);
    if (!item || Number(addQty) <= 0) return;
    if (item.quantity < Number(addQty)) {
      alert(`الكمية المتاحة: ${item.quantity}`);
      return;
    }

    const existing = cart.find((c) => c.item_id === item.id);
    const qty = Number(addQty);
    if (existing) {
      const newQty = existing.quantity + qty;
      if (item.quantity < newQty) {
        alert(`الكمية المتاحة: ${item.quantity}`);
        return;
      }
      const pp =
        showPurchaseCost && item.purchase_price != null && Number.isFinite(Number(item.purchase_price))
          ? Number(item.purchase_price)
          : undefined;
      setCart((prev) =>
        prev.map((c) =>
          c.item_id === item.id
            ? { ...c, quantity: newQty, total: newQty * c.unit_price, purchase_price: pp ?? c.purchase_price }
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
          unit_price: item.sale_price,
          total: qty * item.sale_price,
          purchase_price:
            showPurchaseCost && item.purchase_price != null && Number.isFinite(Number(item.purchase_price))
              ? Number(item.purchase_price)
              : undefined,
        },
      ]);
    }
    setAddItemId("");
    setAddQty("1");
  }, [items, addItemId, addQty, cart, showPurchaseCost]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (addCustomerOpen || showBarcodeScanner) return;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

      if (e.key === "F2") {
        e.preventDefault();
        document.getElementById("cashier-product-search")?.focus();
        return;
      }

      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (addItemId && document.activeElement?.id !== "cashier-product-search") {
          addToCart();
        }
        return;
      }

      if (e.altKey && e.key === "Enter") {
        e.preventDefault();
        if (cart.length > 0 && !isInput) {
          const form = document.querySelector("form");
          if (form) form.requestSubmit();
        }
        return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addItemId, addCustomerOpen, showBarcodeScanner, cart.length, addToCart]);

  function addItemToCartByScan(item: InventoryItem, qty: number = 1) {
    if (item.quantity < qty) {
      alert(`الكمية المتاحة: ${item.quantity}`);
      return;
    }
    const existing = cart.find((c) => c.item_id === item.id);
    if (existing) {
      const newQty = existing.quantity + qty;
      if (item.quantity < newQty) {
        alert(`الكمية المتاحة: ${item.quantity}`);
        return;
      }
      const pp =
        showPurchaseCost && item.purchase_price != null && Number.isFinite(Number(item.purchase_price))
          ? Number(item.purchase_price)
          : undefined;
      setCart((prev) =>
        prev.map((c) =>
          c.item_id === item.id
            ? { ...c, quantity: newQty, total: newQty * c.unit_price, purchase_price: pp ?? c.purchase_price }
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
          unit_price: item.sale_price,
          total: qty * item.sale_price,
          purchase_price:
            showPurchaseCost && item.purchase_price != null && Number.isFinite(Number(item.purchase_price))
              ? Number(item.purchase_price)
              : undefined,
        },
      ]);
    }
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.item_id !== itemId));
  }

  function updateCartQty(itemId: string, qty: number) {
    const item = items.find((i) => i.id === itemId);
    const cartItem = cart.find((c) => c.item_id === itemId);
    if (!item || !cartItem) return;
    const available = item.quantity;
    if (qty > available) {
      alert(`الكمية المتاحة: ${available}`);
      return;
    }
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.item_id === itemId ? { ...c, quantity: qty, total: qty * c.unit_price } : c
      )
    );
  }

  const subtotal = cart.reduce((sum, c) => sum + c.total, 0);

  const { totalPurchaseInCart, allLinesHavePurchaseCost, hasLineBelowPurchase } = useMemo(() => {
    const linesWithCost = cart.filter(
      (c) => c.purchase_price != null && Number.isFinite(Number(c.purchase_price))
    );
    const totalPurchaseInCart = linesWithCost.reduce(
      (s, c) => s + c.quantity * Number(c.purchase_price),
      0
    );
    const allLinesHavePurchaseCost = cart.length > 0 && linesWithCost.length === cart.length;
    const hasLineBelowPurchase = cart.some(
      (c) =>
        c.purchase_price != null &&
        Number.isFinite(Number(c.purchase_price)) &&
        c.unit_price + 1e-9 < Number(c.purchase_price)
    );
    return {
      totalPurchaseInCart,
      allLinesHavePurchaseCost,
      hasLineBelowPurchase,
    };
  }, [cart]);

  const discountAmount = discountEnabled
    ? discountType === "percent"
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0
    : 0;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const marginAfterDiscount =
    showPurchaseCost && allLinesHavePurchaseCost ? afterDiscount - totalPurchaseInCart : null;
  const taxAmount = taxEnabled ? (afterDiscount * (Number(taxRate) || 0)) / 100 : 0;
  const beforeDigitalFee = afterDiscount + taxAmount;
  const digitalFee = Math.max(feeConfig.minFee, beforeDigitalFee * feeConfig.rate);
  const total = beforeDigitalFee + digitalFee;
  const paid = Number(paidAmount) || 0;
  const selectedPaymentMethod = paymentMethods.find((m) => m.id === paymentMethodId);
  const paymentMethodType = selectedPaymentMethod?.type ?? "";
  const isDigitalWalletPay =
    paymentMethodType === "vodafone_cash" || paymentMethodType === "instapay";

  const customerPhoneForWallet = useMemo(() => {
    const c = customers.find((x) => x.id === customerId);
    return (c?.phone ?? "").trim();
  }, [customers, customerId]);

  useEffect(() => {
    if (!isDigitalWalletPay || !customerPhoneForWallet) return;
    setReferenceFrom((prev) => (prev.trim() ? prev : customerPhoneForWallet));
  }, [isDigitalWalletPay, customerPhoneForWallet, paymentMethodId]);

  useEffect(() => {
    const method = paymentMethods.find((m) => m.id === paymentMethodId);
    if (method?.type === "cash") {
      setPaidAmount(total.toFixed(2));
    }
  }, [paymentMethodId, paymentMethods, total]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) {
      alert("أضف أصنافاً للسلة");
      return;
    }

    if (paid > 0 && isDigitalWalletPay && !referenceTo.trim()) {
      alert("أدخل رقم المحفظة أو الحساب المحول إليه (محفظة إلكترونية / إنستاباي)");
      return;
    }

    const payload = {
      customer_id: customerId || undefined,
      items: cart.map((c) => ({ item_id: c.item_id, quantity: c.quantity })),
      payment_method_id: paymentMethodId || undefined,
      paid_amount: paid > 0 ? paid : undefined,
      discount: discountEnabled ? discountAmount : 0,
      tax: taxEnabled ? taxAmount : 0,
      notes: notes.trim() || undefined,
      reference_from:
        paid > 0 && isDigitalWalletPay && referenceFrom.trim() ? referenceFrom.trim() : undefined,
      reference_to: paid > 0 && isDigitalWalletPay ? referenceTo.trim() : undefined,
    };

    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "create_sale_invoice", data: payload });
        setCart([]);
        setCustomerId("");
        setPaymentMethodId("");
        setPaidAmount("");
        setReferenceFrom("");
        setReferenceTo("");
        setNotes("");
        setTaxEnabled(false);
        setDiscountEnabled(false);
        setDiscountValue("");
        clearCashierDraft();
        alert("انقطع الاتصال. تم حفظ الفاتورة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        return;
      }

      const res = await fetch("/api/admin/invoices/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في إنشاء الفاتورة");
        return;
      }

      const data = await res.json();
      setLastInvoice({ id: data.id, invoice_number: data.invoice_number });
      setCart([]);
      setCustomerId("");
      setPaymentMethodId("");
      setPaidAmount("");
      setReferenceFrom("");
      setReferenceTo("");
      setNotes("");
      setTaxEnabled(false);
      setDiscountEnabled(false);
      setDiscountValue("");
      clearCashierDraft();
      fetchData();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "create_sale_invoice", data: payload });
        setCart([]);
        setCustomerId("");
        setPaymentMethodId("");
        setPaidAmount("");
        setReferenceFrom("");
        setReferenceTo("");
        setNotes("");
        setTaxEnabled(false);
        setDiscountEnabled(false);
        setDiscountValue("");
        clearCashierDraft();
        alert("انقطع الاتصال. تم حفظ الفاتورة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ. حاول مرة أخرى.");
      }
    } finally {
      setSaving(false);
    }
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
      setCustomerId(newCustomer.id);
      setAddCustomerOpen(false);
      setNewCustomerForm({ name: "", phone: "", email: "" });
      fetchData();
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

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(settleAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("أدخل مبلغاً صالحاً");
      return;
    }
    setSettling(true);
    try {
      const res = await fetch("/api/admin/distribution/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, notes: settleNotes.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل التسليم");
        return;
      }
      setSettleAmount("");
      setSettleNotes("");
      setDistInfo((prev) =>
        prev ? { ...prev, treasury_balance: Number(data.distribution_balance_after ?? 0) } : null
      );
      fetchData();
      alert("تم تسليم المبلغ للخزينة الرئيسية.");
    } catch {
      alert("حدث خطأ");
    } finally {
      setSettling(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  const selectedAddItem = useMemo(
    () => (addItemId ? items.find((i) => i.id === addItemId) : undefined),
    [items, addItemId]
  );

  return (
    <div className="space-y-6">
      {distInfo && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-100">وضع التوزيع: {distInfo.warehouse_name}</p>
              <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-1">
                رصيد نقد عندك الآن: <strong>{distInfo.treasury_balance.toFixed(2)} ج.م</strong> — التسليم للخزينة الرئيسية <strong>مرن</strong> (ليس إلزامياً يومياً؛ سلّم عندما يناسبك أو لفترة).
              </p>
            </div>
            <form onSubmit={handleSettle} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-emerald-800 dark:text-emerald-300 mb-0.5">مبلغ التسليم</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-32 px-2 py-1.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-sm"
                  placeholder="0"
                />
              </div>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                className="px-2 py-1.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-sm min-w-[120px]"
                placeholder="ملاحظة"
              />
              <button
                type="submit"
                disabled={settling}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {settling ? "..." : "تسليم للخزينة الرئيسية"}
              </button>
            </form>
          </div>
        </div>
      )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إضافة صنف (ابحث بالاسم أو الكود أو امسح الباركود)</h2>
          {showPurchaseCost && (
            <p className="text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-2 mb-3">
              يظهر لك <strong>سعر الشراء</strong> بجانب <strong>سعر البيع</strong> لتقدير المكسب والخصم. الموظفون يرون <strong>سعر البيع</strong> فقط.
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2" title="اختصارات لوحة المفاتيح">
            ⌨️ F2 بحث | Ctrl+Enter إضافة للسلة | Alt+Enter إتمام البيع
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <InventoryCategoryFilter
              id="cashier-item-category"
              loadOnMount
              value={itemCategoryFilter}
              onChange={setItemCategoryFilter}
              className="w-44"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 self-end pb-1">
              «كل الأقسام» ومسح الباركود يبحثان في كل المخزون.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 min-w-[200px]">
              <SearchableSelect
                inputId="cashier-product-search"
                options={items.filter((i) => i.quantity > 0).map(itemToCashierOption)}
                value={addItemId}
                onChange={(id) => setAddItemId(id)}
                placeholder="ابحث بالاسم أو الكود..."
                className={inputClass}
                remoteSearch={cashierRemoteSearch}
                remoteSearchMinChars={1}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowBarcodeScanner(true)}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg shrink-0"
              title="مسح الباركود"
            >
              📷
            </button>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              className="w-24 px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900"
              placeholder="كم"
            />
            <button
              type="button"
              onClick={addToCart}
              disabled={!addItemId}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
            >
              إضافة
            </button>
          </div>
          {selectedAddItem && selectedAddItem.quantity > 0 && (
            <div
              className={`mt-3 grid gap-3 ${showPurchaseCost ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
            >
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/35 px-4 py-3 text-center sm:text-right">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-1">سعر البيع</p>
                <p className="text-xl font-bold text-emerald-950 dark:text-emerald-50 tabular-nums">
                  {selectedAddItem.sale_price.toFixed(2)}{" "}
                  <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">ج.م</span>
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  الكمية المتاحة: {selectedAddItem.quantity}
                </p>
              </div>
              {showPurchaseCost && (
                <div
                  className={`rounded-xl border px-4 py-3 text-center sm:text-right ${
                    selectedAddItem.purchase_price != null &&
                    Number.isFinite(Number(selectedAddItem.purchase_price)) &&
                    Number(selectedAddItem.purchase_price) > 0 &&
                    selectedAddItem.sale_price + 1e-9 < Number(selectedAddItem.purchase_price)
                      ? "border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/30"
                      : "border-sky-200 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-950/35"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold mb-1 ${
                      selectedAddItem.purchase_price != null &&
                      Number.isFinite(Number(selectedAddItem.purchase_price)) &&
                      Number(selectedAddItem.purchase_price) > 0 &&
                      selectedAddItem.sale_price + 1e-9 < Number(selectedAddItem.purchase_price)
                        ? "text-red-900 dark:text-red-100"
                        : "text-sky-900 dark:text-sky-100"
                    }`}
                  >
                    سعر الشراء
                  </p>
                  {selectedAddItem.purchase_price != null &&
                  Number.isFinite(Number(selectedAddItem.purchase_price)) &&
                  Number(selectedAddItem.purchase_price) > 0 ? (
                    <>
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                        {Number(selectedAddItem.purchase_price).toFixed(2)}{" "}
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">ج.م</span>
                      </p>
                      {selectedAddItem.sale_price + 1e-9 < Number(selectedAddItem.purchase_price) ? (
                        <p className="text-xs text-red-800 dark:text-red-200 mt-1 font-medium">
                          تنبيه: سعر البيع أقل من سعر الشراء
                        </p>
                      ) : (
                        <p className="text-xs text-sky-800 dark:text-sky-200 mt-1">
                          هامش تقريبي:{" "}
                          {(selectedAddItem.sale_price - Number(selectedAddItem.purchase_price)).toFixed(2)} ج.م للوحدة
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">غير مسجّل — حدّثه من المخزن أو فاتورة شراء</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-bold text-gray-900">السلة ({cart.length})</h2>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("مسح السلة والبدء من جديد؟")) {
                    setCart([]);
                    setCustomerId("");
                    setPaymentMethodId("");
                    setPaidAmount("");
                    setReferenceFrom("");
                    setReferenceTo("");
                    setNotes("");
                    setTaxEnabled(false);
                    setDiscountEnabled(false);
                    setDiscountValue("");
                    clearCashierDraft();
                  }
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                مسح المسودة
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-gray-500">السلة فارغة</div>
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
                          onChange={(e) => updateCartQty(c.item_id, Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm rounded border border-gray-300"
                        />
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          × بيع {c.unit_price.toFixed(2)} ج.م
                        </span>
                        {showPurchaseCost &&
                          c.purchase_price != null &&
                          Number.isFinite(Number(c.purchase_price)) && (
                            <span
                              className={`text-xs ${
                                c.unit_price + 1e-9 < Number(c.purchase_price)
                                  ? "text-red-600 dark:text-red-400 font-medium"
                                  : "text-sky-700 dark:text-sky-300"
                              }`}
                            >
                              شراء {Number(c.purchase_price).toFixed(2)} ج.م
                            </span>
                          )}
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

      {showBarcodeScanner && (
        <BarcodeScanner
          onScan={async (value) => {
            const item = await findItemByBarcodeOrCodeRemote(value);
            if (item) {
              setItems((prev) => (prev.some((x) => x.id === item.id) ? prev : [...prev, item]));
              addItemToCartByScan(item);
            } else {
              alert("لم يتم العثور على صنف بهذا الباركود أو الكود");
            }
            setShowBarcodeScanner(false);
          }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-900 mb-4">إتمام البيع</h2>

        {restoredFromDraft && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
            تم استعادة المسودة السابقة. يمكنك استكمال البيع أو مسح المسودة.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">العميل (ابحث بالاسم أو رقم الهاتف)</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  options={[
                    { id: "", label: "بدون عميل" },
                    ...customers.map((c) => ({
                      id: c.id,
                      label: c.name,
                      searchText: c.phone ? String(c.phone) : undefined,
                    })),
                  ]}
                  value={customerId}
                  onChange={(id) => setCustomerId(id)}
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  addNewLabel="+ إضافة عميل جديد"
                  addNewFirst
                  onAddNew={() => setAddCustomerOpen(true)}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={() => setAddCustomerOpen(true)}
                className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg shrink-0"
              >
                +
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">المجموع الفرعي</span>
              <span className="font-medium">{subtotal.toFixed(2)} ج.م</span>
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
                <span className="text-sm text-gray-500">= {discountAmount.toFixed(2)} ج.م</span>
              </div>
            )}
            {showPurchaseCost && cart.length > 0 && (
              <>
                {hasLineBelowPurchase && (
                  <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    تنبيه: سطر في السلة بسعر بيع أقل من <strong>سعر الشراء</strong> — تأكد أن هذا مقصود.
                  </p>
                )}
                {marginAfterDiscount !== null && marginAfterDiscount < 0 && (
                  <p className="text-xs text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    بعد الخصم، هامش السلة أقل من تكلفة الشراء بحوالي{" "}
                    <strong>{Math.abs(marginAfterDiscount).toFixed(2)} ج.م</strong> — أنت تبيع بخسارة على الأصناف المعروضة.
                  </p>
                )}
                {marginAfterDiscount !== null && marginAfterDiscount >= 0 && discountEnabled && (
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                    تقريباً بعد الخصم: هامش عن تكلفة الشراء ≈{" "}
                    <strong>{marginAfterDiscount.toFixed(2)} ج.م</strong> (قبل الضريبة والخدمة الرقمية).
                  </p>
                )}
              </>
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
                <span className="text-sm text-gray-500">% = {taxAmount.toFixed(2)} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-700">الخدمة الرقمية</span>
              <span className="font-medium">{digitalFee.toFixed(2)} ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
              <span>الإجمالي النهائي</span>
              <span className="text-emerald-600">{total.toFixed(2)} ج.م</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ المدفوع (ج.م)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </div>

          {paid > 0 && isDigitalWalletPay && (
            <DigitalWalletPaymentFields
              paymentChannel={paymentMethodType as "vodafone_cash" | "instapay"}
              referenceFrom={referenceFrom}
              referenceTo={referenceTo}
              onReferenceFromChange={setReferenceFrom}
              onReferenceToChange={setReferenceTo}
              defaultReferenceFromHint={customerPhoneForWallet || null}
              inputClass={inputClass}
            />
          )}

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
            {saving ? "جاري الإنشاء..." : "إنشاء فاتورة بيع"}
          </button>
        </form>
      </div>

      {addCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">إضافة عميل جديد</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الاسم *</label>
                <input
                  type="text"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  placeholder="اسم العميل"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الهاتف</label>
                <input
                  type="text"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                  className={inputClass}
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">البريد</label>
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
    </div>
    </div>
  );
}
