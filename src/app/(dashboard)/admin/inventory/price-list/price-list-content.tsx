"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { InventoryCategoryFilter } from "@/components/inventory/inventory-category-filter";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { resolveVolumeDiscountPercent, type VolumeDiscountTier } from "@/lib/price-list-volume-discount";

type Party = { id: string; name: string; phone?: string | null };

type ItemRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  unit: string;
  sale_price: number;
  quantity: number;
};

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm";

const VOLUME_DISCOUNT_STORAGE_KEY = "efct-price-list-volume-discount";

const DEFAULT_VOLUME_TIERS: VolumeDiscountTier[] = [
  { minTotal: 20000, percent: 1 },
  { minTotal: 50000, percent: 2 },
];

function normalizeTiers(list: VolumeDiscountTier[]): VolumeDiscountTier[] {
  return list
    .map((t) => ({
      minTotal: Math.max(0, Number(t.minTotal) || 0),
      percent: Math.min(100, Math.max(0, Number(t.percent) || 0)),
    }))
    .filter((t) => t.minTotal > 0 || t.percent > 0);
}

function loadVolumeDiscountPrefs(): { enabled: boolean; tiers: VolumeDiscountTier[] } {
  if (typeof window === "undefined") return { enabled: false, tiers: [...DEFAULT_VOLUME_TIERS] };
  try {
    const raw = localStorage.getItem(VOLUME_DISCOUNT_STORAGE_KEY);
    if (!raw) return { enabled: false, tiers: [...DEFAULT_VOLUME_TIERS] };
    const j = JSON.parse(raw) as { enabled?: unknown; tiers?: unknown };
    const enabled = Boolean(j.enabled);
    let tiers: VolumeDiscountTier[] = [...DEFAULT_VOLUME_TIERS];
    if (Array.isArray(j.tiers) && j.tiers.length > 0) {
      tiers = normalizeTiers(
        j.tiers.map((x) => ({
          minTotal: Number((x as { minTotal?: unknown }).minTotal),
          percent: Number((x as { percent?: unknown }).percent),
        }))
      );
      if (tiers.length === 0) tiers = [...DEFAULT_VOLUME_TIERS];
    }
    return { enabled, tiers };
  } catch {
    return { enabled: false, tiers: [...DEFAULT_VOLUME_TIERS] };
  }
}

function saveVolumeDiscountPrefs(enabled: boolean, tiers: VolumeDiscountTier[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      VOLUME_DISCOUNT_STORAGE_KEY,
      JSON.stringify({ enabled, tiers: normalizeTiers(tiers) })
    );
  } catch {
    /* ignore */
  }
}

type RecipientMode = "none" | "customer" | "supplier" | "company";

/** صلاحية عرض الأسعار في الطباعة فقط — لا تؤثر على المخزن */
type OfferValidityMode = "none" | "days" | "until";

export function PriceListContent({ companyName }: { companyName: string | null }) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("عرض أسعار");

  const [customers, setCustomers] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("none");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [externalCompanyName, setExternalCompanyName] = useState("");
  const [externalCompanyPhone, setExternalCompanyPhone] = useState("");

  const [offerValidityMode, setOfferValidityMode] = useState<OfferValidityMode>("none");
  const [offerValidityDays, setOfferValidityDays] = useState("3");
  const [offerValidUntil, setOfferValidUntil] = useState("");

  const [volumeDiscountEnabled, setVolumeDiscountEnabled] = useState(false);
  const [volumeDiscountTiers, setVolumeDiscountTiers] = useState<VolumeDiscountTier[]>(() => [...DEFAULT_VOLUME_TIERS]);
  const [volumePrefsLoaded, setVolumePrefsLoaded] = useState(false);

  useEffect(() => {
    const p = loadVolumeDiscountPrefs();
    setVolumeDiscountEnabled(p.enabled);
    setVolumeDiscountTiers(p.tiers.length ? p.tiers : [...DEFAULT_VOLUME_TIERS]);
    setVolumePrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!volumePrefsLoaded) return;
    saveVolumeDiscountPrefs(volumeDiscountEnabled, volumeDiscountTiers);
  }, [volumePrefsLoaded, volumeDiscountEnabled, volumeDiscountTiers]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/customers?limit=500&offset=0").then((r) => (r.ok ? r.json() : { customers: [] })),
      fetch("/api/admin/suppliers?limit=500&offset=0").then((r) => (r.ok ? r.json() : { suppliers: [] })),
    ])
      .then(([c, s]) => {
        setCustomers(Array.isArray(c) ? c : (c.customers ?? []));
        setSuppliers(Array.isArray(s) ? s : (s.suppliers ?? []));
      })
      .catch(() => {});
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "500");
      params.set("offset", "0");
      if (debounced) params.set("search", debounced);
      if (category) params.set("category", category);
      if (inStockOnly) params.set("in_stock", "1");
      const res = await fetch(`/api/admin/inventory/items?${params.toString()}`);
      const d = res.ok ? await res.json() : { items: [] };
      const list = Array.isArray(d) ? d : (d.items ?? []);
      setItems(list);
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const it of list as ItemRow[]) {
          if (prev.has(it.id)) next.add(it.id);
        }
        return next;
      });
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, category, inStockOnly]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const rowsForPrint = useMemo(() => {
    const chosen = items.filter((i) => selectedIds.has(i.id));
    return chosen.length > 0 ? chosen : items;
  }, [items, selectedIds]);

  /** إجمالي قيمة الأصناف المعروضة (سعر × كمية المتاح) — أساس شرائح الخصم */
  const listSubtotal = useMemo(
    () => rowsForPrint.reduce((s, r) => s + r.sale_price * r.quantity, 0),
    [rowsForPrint]
  );

  const appliedVolumePercent = useMemo(() => {
    if (!volumeDiscountEnabled) return 0;
    return resolveVolumeDiscountPercent(listSubtotal, volumeDiscountTiers);
  }, [volumeDiscountEnabled, listSubtotal, volumeDiscountTiers]);

  const volumeDiscountAmount = useMemo(
    () => (appliedVolumePercent > 0 ? (listSubtotal * appliedVolumePercent) / 100 : 0),
    [listSubtotal, appliedVolumePercent]
  );

  const listTotalAfterVolume = useMemo(
    () => Math.max(0, listSubtotal - volumeDiscountAmount),
    [listSubtotal, volumeDiscountAmount]
  );

  function addVolumeTier() {
    setVolumeDiscountTiers((prev) => [...prev, { minTotal: 100000, percent: 3 }]);
  }

  function removeVolumeTier(index: number) {
    setVolumeDiscountTiers((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateVolumeTier(index: number, patch: Partial<VolumeDiscountTier>) {
    setVolumeDiscountTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...patch } : t))
    );
  }

  function resetVolumeTiersDefault() {
    setVolumeDiscountTiers([...DEFAULT_VOLUME_TIERS]);
  }

  const recipientBlockHtml = useMemo(() => {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fromLine = companyName
      ? `<p class="hdr-line"><span class="lbl">من:</span> ${esc(companyName)}</p>`
      : `<p class="hdr-line"><span class="lbl">من:</span> شركة / منشأة</p>`;

    if (recipientMode === "none") {
      return `${fromLine}<p class="hdr-note">— يمكن تحديد الجهة الموجّه إليها من القائمة أعلاه لظهورها بصيغة رسمية —</p>`;
    }
    if (recipientMode === "customer" && customerId) {
      const c = customers.find((x) => x.id === customerId);
      const name = c?.name ?? "";
      const phone = c?.phone ? ` — هاتف: ${c.phone}` : "";
      return `${fromLine}<p class="hdr-line to"><span class="lbl">إلى السادة /</span> ${esc(name + phone)}</p><p class="hdr-sub">عملاء — عرض أسعار</p>`;
    }
    if (recipientMode === "supplier" && supplierId) {
      const s = suppliers.find((x) => x.id === supplierId);
      const name = s?.name ?? "";
      const phone = s?.phone ? ` — هاتف: ${s.phone}` : "";
      return `${fromLine}<p class="hdr-line to"><span class="lbl">إلى السادة /</span> ${esc(name + phone)}</p><p class="hdr-sub">موردون — عرض أسعار</p>`;
    }
    if (recipientMode === "company" && externalCompanyName.trim()) {
      const ph = externalCompanyPhone.trim() ? ` — هاتف: ${externalCompanyPhone.trim()}` : "";
      return `${fromLine}<p class="hdr-line to"><span class="lbl">إلى السادة / شركة</span> ${esc(externalCompanyName.trim() + ph)}</p><p class="hdr-sub">جهة خارجية — عرض أسعار</p>`;
    }
    return `${fromLine}<p class="hdr-note">أكمل بيانات الجهة الموجّه إليها</p>`;
  }, [
    companyName,
    recipientMode,
    customerId,
    supplierId,
    customers,
    suppliers,
    externalCompanyName,
    externalCompanyPhone,
  ]);

  const buildOfferValidityFooter = (): string => {
    const issue = new Date();
    const issueAr = issue.toLocaleDateString("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (offerValidityMode === "days") {
      const n = Math.min(365, Math.max(1, parseInt(offerValidityDays, 10) || 3));
      const dayPhrase = n === 1 ? "يوماً واحداً" : n === 2 ? "يومين" : `${n} أيام`;
      return `تاريخ إصدار عرض الأسعار: ${issueAr}. هذا العرض سارٍ لمدة ${dayPhrase} فقط من تاريخ إصداره.`;
    }
    if (offerValidityMode === "until" && offerValidUntil.trim()) {
      const d = new Date(offerValidUntil.trim() + "T12:00:00");
      if (Number.isNaN(d.getTime())) return "";
      const untilAr = d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      return `تاريخ إصدار عرض الأسعار: ${issueAr}. هذا العرض سارٍ حتى تاريخ ${untilAr}.`;
    }
    return "";
  };

  const handlePrint = () => {
    if (offerValidityMode === "days") {
      const n = parseInt(offerValidityDays, 10);
      if (!Number.isFinite(n) || n < 1 || n > 365) {
        alert("أدخل عدد أيام بين 1 و 365 أو عطّل صلاحية العرض.");
        return;
      }
    }
    if (offerValidityMode === "until" && !offerValidUntil.trim()) {
      alert("اختر تاريخ انتهاء صلاحية العرض أو غيّر نوع الصلاحية.");
      return;
    }
    if (recipientMode === "customer" && !customerId) {
      alert("اختر عميلاً أو غيّر «الجهة الموجّه إليها».");
      return;
    }
    if (recipientMode === "supplier" && !supplierId) {
      alert("اختر مورداً أو غيّر «الجهة الموجّه إليها».");
      return;
    }
    if (recipientMode === "company" && !externalCompanyName.trim()) {
      alert("أدخل اسم الشركة / الجهة الخارجية أو اختر نوعاً آخر.");
      return;
    }
    const w = window.open("", "_blank");
    if (!w) {
      alert("اسمح بالنوافذ المنبثقة للطباعة");
      return;
    }
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const subtitle =
      selectedIds.size > 0
        ? `${selectedIds.size} صنف مختار`
        : inStockOnly
          ? "جميع الأصناف المتاحة في المخزون (حسب الفلاتر)"
          : "جميع الأصناف (حسب الفلاتر)";
    const printSubtotal = rowsForPrint.reduce((s, r) => s + r.sale_price * r.quantity, 0);
    const pVol = volumeDiscountEnabled ? resolveVolumeDiscountPercent(printSubtotal, volumeDiscountTiers) : 0;
    const factor = pVol > 0 ? 1 - pVol / 100 : 1;
    const printDiscountAmt = pVol > 0 ? (printSubtotal * pVol) / 100 : 0;
    const printAfter = Math.max(0, printSubtotal - printDiscountAmt);
    const tiersSorted = [...normalizeTiers(volumeDiscountTiers)].sort((a, b) => a.minTotal - b.minTotal);
    const tiersTableHtml =
      volumeDiscountEnabled && tiersSorted.length > 0
        ? `<p class="tier-hdr">جدول شرائح الخصم (مرجع)</p>
           <table class="tiertbl"><thead><tr><th>من إجمالي (ج.م)</th><th>نسبة الخصم</th></tr></thead><tbody>${tiersSorted
             .map(
               (t) =>
                 `<tr><td class="num">${t.minTotal.toLocaleString("ar-EG")}</td><td class="num">${t.percent}%</td></tr>`
             )
             .join("")}</tbody></table>`
        : "";
    const theadCols =
      pVol > 0
        ? `<th>الصنف</th><th>الكود</th><th>القسم</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة</th><th>بعد خصم ${pVol}%</th><th>إجمالي السطر</th>`
        : `<th>الصنف</th><th>الكود</th><th>القسم</th><th>الوحدة</th><th>الكمية</th><th>سعر البيع</th>`;
    const rowsHtml = rowsForPrint
      .map((r) => {
        const qtyStr = r.quantity.toFixed(r.quantity % 1 === 0 ? 0 : 2);
        if (pVol > 0) {
          const unitAfter = r.sale_price * factor;
          const lineAfter = r.quantity * unitAfter;
          return `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.code || "—")}</td>
        <td>${esc(r.category || "—")}</td>
        <td>${esc(r.unit || "قطعة")}</td>
        <td class="num">${qtyStr}</td>
        <td class="num">${r.sale_price.toFixed(2)} ج.م</td>
        <td class="num">${unitAfter.toFixed(2)} ج.م</td>
        <td class="num">${lineAfter.toFixed(2)} ج.م</td>
      </tr>`;
        }
        return `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.code || "—")}</td>
        <td>${esc(r.category || "—")}</td>
        <td>${esc(r.unit || "قطعة")}</td>
        <td class="num">${qtyStr}</td>
        <td class="num">${r.sale_price.toFixed(2)} ج.م</td>
      </tr>`;
      })
      .join("");
    const summaryBlock =
      volumeDiscountEnabled && pVol > 0
        ? `${tiersTableHtml}
          <table class="sumtbl"><tbody>
            <tr><td>إجمالي عرض الأسعار (قبل الخصم)</td><td class="num">${printSubtotal.toFixed(2)} ج.م</td></tr>
            <tr><td>خصم حجم (${pVol}%)</td><td class="num">− ${printDiscountAmt.toFixed(2)} ج.م</td></tr>
            <tr class="bold"><td>الإجمالي بعد الخصم</td><td class="num">${printAfter.toFixed(2)} ج.م</td></tr>
          </tbody></table>
          <p class="tier-note">${esc(
            `يُطبَّق خصم ${pVol}% لأن إجمالي قيمة الأصناف في هذا العرض (${printSubtotal.toFixed(2)} ج.م) يحقق أعلى شريحة في الجدول أعلاه.`
          )}</p>`
        : volumeDiscountEnabled && pVol === 0 && printSubtotal > 0
          ? `${tiersTableHtml}<p class="tier-note">${esc(
              `«خصم حسب إجمالي العرض» مفعّل؛ إجمالي القائمة ${printSubtotal.toFixed(2)} ج.م أقل من أدنى حد في الشرائح — لا خصم على هذا العرض.`
            )}</p>`
          : volumeDiscountEnabled && printSubtotal <= 0
            ? `${tiersTableHtml}`
            : "";
    const cn = companyName ? esc(companyName) : "عرض أسعار";
    const validityExtra = buildOfferValidityFooter();
    const footNote = validityExtra
      ? `${esc(validityExtra)} `
      : "";
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        @page { margin: 12mm; }
        body { font-family: Arial, Tahoma, sans-serif; font-size: 11px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        .letterhead { border: 1px solid #ddd; padding: 10px 12px; margin-bottom: 14px; background: #fafafa; }
        .hdr-line { margin: 4px 0; font-size: 12px; }
        .hdr-line.to { font-weight: 600; }
        .lbl { color: #444; font-weight: 600; margin-left: 6px; }
        .hdr-sub { margin: 6px 0 0; font-size: 10px; color: #666; }
        .hdr-note { font-size: 10px; color: #888; margin: 4px 0 0; }
        .sub { color: #555; margin-bottom: 16px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
        th { background: #f3f4f6; font-weight: 600; }
        .num { direction: ltr; text-align: left; unicode-bidi: isolate; }
        .foot { margin-top: 14px; font-size: 10px; color: #666; }
        .validity-note { margin-top: 12px; padding: 8px 10px; border: 1px solid #d1d5db; background: #f9fafb; font-size: 11px; color: #111; font-weight: 600; line-height: 1.5; }
        .sumtbl { width: 100%; max-width: 420px; margin: 14px 0 8px; border-collapse: collapse; font-size: 11px; }
        .sumtbl td { border: 1px solid #ccc; padding: 6px 8px; }
        .sumtbl tr.bold td { font-weight: 700; background: #f3f4f6; }
        .tier-hdr { margin: 14px 0 6px; font-size: 11px; font-weight: 600; color: #333; }
        .tiertbl { width: 100%; max-width: 320px; border-collapse: collapse; font-size: 10px; margin-bottom: 10px; }
        .tiertbl th, .tiertbl td { border: 1px solid #ccc; padding: 4px 8px; text-align: right; }
        .tiertbl th { background: #e5e7eb; }
        .tier-note { font-size: 10px; color: #444; line-height: 1.45; margin: 8px 0 0; max-width: 520px; }
      </style></head><body>
      <h1>${esc(title)}</h1>
      <div class="letterhead">${recipientBlockHtml}</div>
      <div class="sub">${cn} — ${esc(subtitle)}</div>
      <table><thead><tr>${theadCols}</tr></thead><tbody>${rowsHtml}</tbody></table>
      ${summaryBlock}
      ${validityExtra ? `<p class="validity-note">${footNote}</p>` : ""}
      <p class="foot">مستند عرض أسعار صادر من المنشأة أعلاه. الأسعار وفق سعر البيع المسجّل في المخزن ولا تُعد فاتورة بيع حتى الاتفاق والتأكيد.${validityExtra ? "" : " صالح لتاريخ الطباعة."}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 300);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500 mb-1">بحث</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="اسم، كود، باركود، قسم..."
            className={inputClass}
          />
        </div>
        <InventoryCategoryFilter
          id="price-list-category"
          loadOnMount
          value={category}
          onChange={setCategory}
          className="w-44"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="rounded border-gray-300"
          />
          المتاح فقط (كمية &gt; 0)
        </label>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">توجيه رسمي (اختياري)</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[160px]">
            <label className="block text-xs text-gray-500 mb-1">الجهة الموجّه إليها</label>
            <select
              value={recipientMode}
              onChange={(e) => {
                const v = e.target.value as RecipientMode;
                setRecipientMode(v);
                setCustomerId("");
                setSupplierId("");
                if (v !== "company") {
                  setExternalCompanyName("");
                  setExternalCompanyPhone("");
                }
              }}
              className={inputClass}
            >
              <option value="none">عام (بدون توجيه)</option>
              <option value="customer">عميل من القائمة</option>
              <option value="supplier">مورد من القائمة</option>
              <option value="company">شركة / جهة خارجية (اسم يدوي)</option>
            </select>
          </div>
          {recipientMode === "customer" && (
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-gray-500 mb-1">اختر العميل</label>
              <SearchableSelect
                options={customers.map((c) => ({
                  id: c.id,
                  label: c.name,
                  searchText: c.phone ? String(c.phone) : undefined,
                }))}
                value={customerId}
                onChange={(id) => setCustomerId(id)}
                placeholder="ابحث بالاسم أو الهاتف..."
                className={inputClass}
              />
            </div>
          )}
          {recipientMode === "supplier" && (
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs text-gray-500 mb-1">اختر المورد</label>
              <SearchableSelect
                options={suppliers.map((s) => ({
                  id: s.id,
                  label: s.name,
                  searchText: s.phone ? String(s.phone) : undefined,
                }))}
                value={supplierId}
                onChange={(id) => setSupplierId(id)}
                placeholder="ابحث بالاسم أو الهاتف..."
                className={inputClass}
              />
            </div>
          )}
          {recipientMode === "company" && (
            <>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-gray-500 mb-1">اسم الشركة / الجهة *</label>
                <input
                  type="text"
                  value={externalCompanyName}
                  onChange={(e) => setExternalCompanyName(e.target.value)}
                  className={inputClass}
                  placeholder="مثال: شركة…"
                />
              </div>
              <div className="w-40">
                <label className="block text-xs text-gray-500 mb-1">هاتف (اختياري)</label>
                <input
                  type="text"
                  value={externalCompanyPhone}
                  onChange={(e) => setExternalCompanyPhone(e.target.value)}
                  className={inputClass}
                  placeholder="01..."
                />
              </div>
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          يظهر في أعلى الطباعة: <strong>من</strong> اسم شركتك، و<strong>إلى</strong> الجهة التي تختارها — مناسب لمراسلات B2B.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">صلاحية عرض الأسعار (اختياري — للطباعة فقط)</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">نوع الصلاحية</label>
            <select
              value={offerValidityMode}
              onChange={(e) => setOfferValidityMode(e.target.value as OfferValidityMode)}
              className={inputClass}
            >
              <option value="none">بدون نص صلاحية إضافي</option>
              <option value="days">سارٍ لعدد أيام من تاريخ الإصدار</option>
              <option value="until">سارٍ حتى تاريخ محدد</option>
            </select>
          </div>
          {offerValidityMode === "days" && (
            <div className="w-32">
              <label className="block text-xs text-gray-500 mb-1">عدد الأيام</label>
              <input
                type="number"
                min={1}
                max={365}
                value={offerValidityDays}
                onChange={(e) => setOfferValidityDays(e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
          )}
          {offerValidityMode === "until" && (
            <div className="min-w-[180px]">
              <label className="block text-xs text-gray-500 mb-1">صالح حتى</label>
              <input
                type="date"
                value={offerValidUntil}
                onChange={(e) => setOfferValidUntil(e.target.value)}
                className={inputClass}
                dir="ltr"
              />
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          يُذكر في أسفل ورقة الطباعة مع <strong>تاريخ إصدار</strong> العرض. لا يغيّر أسعار المخزن ولا يلزم العملاء قانونياً — صياغة استرشادية.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">خصم حسب إجمالي عرض السعر (اختياري — للطباعة فقط)</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          يُحسب الإجمالي من <strong>سعر البيع × الكمية المتاحة</strong> لكل صف في القائمة المعروضة (المحدد أو الكل). تُطبَّق{' '}
          <strong>أعلى شريحة</strong> يحققها هذا الإجمالي: مثلاً من 20 ألف → 1%، من 50 ألف → 2%. عدّل الشرائح كما تشاء.
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={volumeDiscountEnabled}
            onChange={(e) => setVolumeDiscountEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
          تفعيل خصم حسب إجمالي العرض
        </label>
        {volumeDiscountEnabled && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={addVolumeTier}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                + شريحة
              </button>
              <button
                type="button"
                onClick={resetVolumeTiersDefault}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                استعادة 20 ألف / 1% و 50 ألف / 2%
              </button>
            </div>
            <div className="space-y-2">
              {volumeDiscountTiers.map((tier, index) => (
                <div key={index} className="flex flex-wrap gap-2 items-end">
                  <div className="w-36">
                    <label className="block text-xs text-gray-500 mb-0.5">من إجمالي (ج.م)</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={tier.minTotal || ""}
                      onChange={(e) =>
                        updateVolumeTier(index, { minTotal: Number(e.target.value) || 0 })
                      }
                      className={inputClass}
                      dir="ltr"
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-xs text-gray-500 mb-0.5">خصم %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={tier.percent || ""}
                      onChange={(e) =>
                        updateVolumeTier(index, { percent: Number(e.target.value) || 0 })
                      }
                      className={inputClass}
                      dir="ltr"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVolumeTier(index)}
                    className="px-2 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg mb-0.5"
                    aria-label="حذف الشريحة"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
            <div className="text-sm rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2 text-emerald-900 dark:text-emerald-100">
              <span className="font-medium">معاينة القائمة الحالية:</span> إجمالي{" "}
              <strong>{listSubtotal.toFixed(2)} ج.م</strong>
              {appliedVolumePercent > 0 ? (
                <>
                  {" "}
                  — خصم مطبّق <strong>{appliedVolumePercent}%</strong> (−
                  {volumeDiscountAmount.toFixed(2)} ج.م) — بعد الخصم{" "}
                  <strong>{listTotalAfterVolume.toFixed(2)} ج.م</strong>
                </>
              ) : listSubtotal > 0 ? (
                <> — لا تصل لأدنى حد في الشرائح (لا خصم على هذا العرض)</>
              ) : (
                <> — أضف أصنافاً لعرض الإجمالي</>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${inputClass} max-w-xs`}
          placeholder="عنوان المستند"
        />
        <button
          type="button"
          onClick={toggleAll}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل المعروض"}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          disabled={loading || rowsForPrint.length === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          طباعة / PDF
        </button>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        اختر أصنافاً محددة بالمربعات، أو اترك بدون تحديد لطباعة <strong>كل ما يظهر في القائمة</strong> حسب البحث والفلتر.
        زر «طباعة» يفتح نافذة الطباعة — يمكنك حفظها كـ PDF من المتصفح.
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-gray-500">جاري التحميل...</p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-gray-500">لا توجد أصناف تطابق الفلتر.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="w-10 px-2 py-3"></th>
                  <th className="text-right px-4 py-3">الصنف</th>
                  <th className="text-right px-4 py-3">الكود</th>
                  <th className="text-right px-4 py-3">القسم</th>
                  <th className="text-right px-4 py-3">الكمية</th>
                  <th className="text-right px-4 py-3">سعر البيع</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-gray-50 dark:border-gray-700/80">
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(it.id)}
                        onChange={() => toggleOne(it.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{it.name}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">{it.code || "—"}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{it.category || "—"}</td>
                    <td className="px-4 py-2">{it.quantity}</td>
                    <td className="px-4 py-2 font-medium">{it.sale_price.toFixed(2)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
