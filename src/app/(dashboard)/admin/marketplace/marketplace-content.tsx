"use client";

import { useState, useEffect, useCallback } from "react";
import { SYSTEM_COMPANY_ID } from "@/lib/company";
import { MarketplaceImageField } from "@/components/marketplace/marketplace-image-field";

const DEMO_LABEL = "block text-xs font-medium text-gray-800 dark:text-gray-200 mb-1";
const DEMO_FIELD =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500";

type WalletCompanyRow = { id: string; name: string; business_type?: string; is_active?: boolean };

/** شركة يُسمح لها ظهور إعلانات سوق تحت اسمها (مورّد أو مختلط) */
function pickAnnounceCompanyId(rows: WalletCompanyRow[]): string {
  const active = rows.filter((r) => r.is_active !== false);
  const eligible = active.filter((r) => {
    const bt = String(r.business_type ?? "both");
    return bt === "supplier" || bt === "both";
  });
  if (eligible.length === 0) return "";
  /** شركة النظام (إعدادات السوبر أدمن) تُفضَّل إن كانت مؤهّلة */
  const system = eligible.find((r) => r.id === SYSTEM_COMPANY_ID);
  if (system) return system.id;
  const suppliers = eligible.filter((r) => String(r.business_type ?? "") === "supplier");
  const pool = suppliers.length > 0 ? suppliers : eligible;
  const sorted = [...pool].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  return sorted[0].id;
}

function SuperMarketplaceAdmin() {
  const [packages, setPackages] = useState<
    { id: string; label_ar: string; duration_days: number; price: number; category_scope: string; is_active: boolean }[]
  >([]);
  const [listings, setListings] = useState<
    { id: string; title_ar: string; status: string; ends_at: string | null; company_name: string }[]
  >([]);
  const [companies, setCompanies] = useState<WalletCompanyRow[]>([]);
  const [demoCompanyId, setDemoCompanyId] = useState("");
  const [demoCompanyOverride, setDemoCompanyOverride] = useState(false);
  const [demoTitle, setDemoTitle] = useState("إعلان تجريبي");
  const [demoDesc, setDemoDesc] = useState("");
  const [demoPrice, setDemoPrice] = useState("");
  const [demoPhone, setDemoPhone] = useState("");
  const [demoWa, setDemoWa] = useState("");
  const [demoImageUrl, setDemoImageUrl] = useState("");
  const [demoImageBlobUrl, setDemoImageBlobUrl] = useState("");
  const [demoCategory, setDemoCategory] = useState<"parts" | "workshop">("parts");
  const [demoPackageId, setDemoPackageId] = useState("");
  const [demoSaving, setDemoSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, l, c, me] = await Promise.all([
        fetch("/api/admin/super/marketplace/packages"),
        fetch("/api/admin/super/marketplace/listings?limit=50"),
        fetch("/api/admin/wallets/companies"),
        fetch("/api/admin/company"),
      ]);
      if (p.ok) setPackages((await p.json()).packages ?? []);
      if (l.ok) setListings((await l.json()).listings ?? []);
      let list: WalletCompanyRow[] = [];
      if (c.ok) {
        const rows = await c.json();
        list = Array.isArray(rows)
          ? rows.map((x: WalletCompanyRow) => ({
              id: x.id,
              name: x.name,
              business_type: x.business_type,
              is_active: x.is_active,
            }))
          : [];
      }
      /** شركة النظام (company-system) — نفس بيانات «إعدادات الشركة» للسوبر أدمن؛ مستثناة من قائمة المحافظ */
      if (me.ok) {
        const d = await me.json();
        if (!d.error && d.id === SYSTEM_COMPANY_ID) {
          const row: WalletCompanyRow = {
            id: d.id,
            name: d.name ?? "نظام EFCT",
            business_type: d.business_type ?? "both",
            is_active: true,
          };
          list = [row, ...list.filter((x) => x.id !== SYSTEM_COMPANY_ID)];
        }
      }
      setCompanies(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** تلقائياً: أول شركة مورّد (أو مختلط إن لم يوجد مورّد) — الإعلان يُسجَّل باسمها */
  useEffect(() => {
    if (companies.length === 0 || demoCompanyOverride) return;
    const id = pickAnnounceCompanyId(companies);
    if (id) setDemoCompanyId(id);
  }, [companies, demoCompanyOverride]);

  const announceCompanyName = companies.find((c) => c.id === demoCompanyId)?.name ?? "";
  const eligibleCompanies = companies.filter((r) => {
    const bt = String(r.business_type ?? "both");
    return r.is_active !== false && (bt === "supplier" || bt === "both");
  });

  async function togglePackage(id: string, is_active: boolean) {
    await fetch(`/api/admin/super/marketplace/packages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    });
    await load();
  }

  async function stopListing(id: string) {
    if (!confirm("إيقاف هذا الإعلان فوراً؟")) return;
    const res = await fetch(`/api/admin/super/marketplace/listings/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert((await res.json()).error || "فشل");
  }

  useEffect(() => {
    const forCat = packages.filter(
      (x) => x.is_active && (x.category_scope === demoCategory || x.category_scope === "both")
    );
    if (forCat.length === 0) return;
    const stillOk = forCat.some((x) => x.id === demoPackageId);
    if (!demoPackageId || !stillOk) {
      setDemoPackageId(forCat[0].id);
    }
  }, [packages, demoCategory, demoPackageId]);

  async function submitDemoListing() {
    if (!demoCompanyId || !demoTitle.trim() || !demoPhone.trim() || !demoPackageId) {
      if (!demoCompanyId && eligibleCompanies.length === 0) {
        alert("لا توجد شركة نوعها «مورّد» أو «مختلط» لتسجيل الإعلان باسمها. أضف شركة أو غيّر النشاط من المحافظ.");
      } else {
        alert("أدخل العنوان والهاتف وتأكد من اختيار الشركة المعتمدة");
      }
      return;
    }
    setDemoSaving(true);
    try {
      const res = await fetch("/api/admin/super/marketplace/listings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: demoCompanyId,
          title_ar: demoTitle.trim(),
          description_ar: demoDesc.trim() || undefined,
          list_price: demoPrice ? Number(demoPrice) : undefined,
          category: demoCategory,
          package_id: demoPackageId,
          contact_phone: demoPhone.trim(),
          contact_whatsapp: demoWa.trim() || undefined,
          image_url: demoImageUrl.trim() || undefined,
          image_blob_url:
            demoImageBlobUrl && demoImageUrl.trim() === demoImageBlobUrl.trim()
              ? demoImageBlobUrl.trim()
              : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "فشل");
        return;
      }
      alert(`تم نشر الإعلان التجريبي حتى ${d.ends_at}. يظهر في /market`);
      await load();
    } finally {
      setDemoSaving(false);
    }
  }

  if (loading) return <p className="text-gray-600 dark:text-gray-400">جاري التحميل...</p>;

  return (
    <div className="space-y-8">
      <div className="bg-amber-50/90 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2">إعلان تجريبي (سوبر أدمن)</h2>
        <p className="text-sm text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
          نشر فوري على صفحة السوق العامة <strong>بدون خصم من المحفظة</strong> (تجريبي). يُسجَّل الإعلان في النظام <strong>باسم شركة معلّن</strong> (مورّد أو مختلط) — هي الظاهرة في السوق والمعنية بالمحتوى والتواصل أمام العملاء.
        </p>
        <p className="text-xs text-amber-900 dark:text-amber-200/90 mb-4 leading-relaxed border border-amber-300/80 dark:border-amber-700/60 rounded-lg px-3 py-2 bg-amber-100/50 dark:bg-amber-950/50">
          <strong>المسؤولية:</strong> المنصة وسيط عرض؛ <strong>اسم الشركة المعروض</strong> هو مرجع الإعلان في قاعدة البيانات. يُفضّل أن يطابق بيانات التواصل والمنتج الفعليين لدى تلك الشركة.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="md:col-span-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/60 px-3 py-3">
            <label className={DEMO_LABEL}>المعلن (يُختار تلقائياً)</label>
            {eligibleCompanies.length === 0 ? (
              <p className="text-sm text-red-700 dark:text-red-300">
                لا توجد شركة نشطة نوعها «مورّد» أو «مختلط». أضف شركة أو عدّل النشاط من المحافظ.
              </p>
            ) : (
              <>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {announceCompanyName || "…"}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  تلقائياً: <strong>شركة المنصة</strong> (نفس بيانات «إعدادات الشركة» عند دخولك كسوبر أدمن) إن كان نوع النشاط مورّد
                  أو مختلط؛ وإلا أول شركة <strong>مورّد</strong> ثم <strong>مختلط</strong> في القائمة.
                </p>
                <label className="mt-3 flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={demoCompanyOverride}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setDemoCompanyOverride(on);
                      if (!on) {
                        const id = pickAnnounceCompanyId(companies);
                        if (id) setDemoCompanyId(id);
                      } else {
                        const el = companies.filter((r) => {
                          const bt = String(r.business_type ?? "both");
                          return r.is_active !== false && (bt === "supplier" || bt === "both");
                        });
                        if (el.length && !el.some((c) => c.id === demoCompanyId)) {
                          setDemoCompanyId(el[0].id);
                        }
                      }
                    }}
                    className="rounded"
                  />
                  تغيير الشركة المعتمدة يدوياً (مورّد / مختلط فقط)
                </label>
                {demoCompanyOverride && (
                  <select
                    value={demoCompanyId}
                    onChange={(e) => setDemoCompanyId(e.target.value)}
                    className={`${DEMO_FIELD} mt-2`}
                  >
                    {eligibleCompanies.map((co) => (
                      <option key={co.id} value={co.id}>
                        {co.name}
                        {String(co.business_type ?? "") === "supplier" ? " (مورّد)" : " (مختلط)"}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
          <div>
            <label className={DEMO_LABEL}>القسم</label>
            <select
              value={demoCategory}
              onChange={(e) => setDemoCategory(e.target.value as "parts" | "workshop")}
              className={DEMO_FIELD}
            >
              <option value="parts">قطع غيار</option>
              <option value="workshop">مستلزمات ومعدات ورشة</option>
            </select>
          </div>
          <div>
            <label className={DEMO_LABEL}>الباقة (للمدة فقط — بدون دفع)</label>
            <select
              value={demoPackageId}
              onChange={(e) => setDemoPackageId(e.target.value)}
              className={DEMO_FIELD}
            >
              {packages
                .filter((p) => p.is_active && (p.category_scope === demoCategory || p.category_scope === "both"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label_ar} ({p.duration_days} يوم)
                  </option>
                ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={DEMO_LABEL}>عنوان الإعلان</label>
            <input
              value={demoTitle}
              onChange={(e) => setDemoTitle(e.target.value)}
              className={DEMO_FIELD}
            />
          </div>
          <div className="md:col-span-2">
            <label className={DEMO_LABEL}>الوصف</label>
            <textarea
              value={demoDesc}
              onChange={(e) => setDemoDesc(e.target.value)}
              rows={2}
              className={DEMO_FIELD}
            />
          </div>
          <div>
            <label className={DEMO_LABEL}>سعر إرشادي</label>
            <input
              type="number"
              step="0.01"
              value={demoPrice}
              onChange={(e) => setDemoPrice(e.target.value)}
              className={DEMO_FIELD}
            />
          </div>
          <div>
            <label className={DEMO_LABEL}>هاتف</label>
            <input
              value={demoPhone}
              onChange={(e) => setDemoPhone(e.target.value)}
              className={DEMO_FIELD}
              dir="ltr"
            />
          </div>
          <div>
            <label className={DEMO_LABEL}>واتساب (اختياري)</label>
            <input
              value={demoWa}
              onChange={(e) => setDemoWa(e.target.value)}
              className={DEMO_FIELD}
              dir="ltr"
              placeholder="2010..."
            />
          </div>
          <div className="md:col-span-2">
            <MarketplaceImageField
              imageUrl={demoImageUrl}
              imageBlobUrl={demoImageBlobUrl}
              onChange={({ imageUrl, imageBlobUrl: blob }) => {
                setDemoImageUrl(imageUrl);
                setDemoImageBlobUrl(blob);
              }}
              inputClass={DEMO_FIELD}
              labelClass={DEMO_LABEL}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={demoSaving}
          onClick={() => void submitDemoListing()}
          className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium"
        >
          {demoSaving ? "..." : "نشر الإعلان التجريبي"}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">باقات السوق</h2>
        <p className="text-sm text-gray-500 mb-4">تعديل السعر أو المدة أو تعطيل الباقة. الشركات المورّدة ترى الباقات النشطة فقط.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-right py-2 px-2">الباقة</th>
                <th className="text-right py-2 px-2">أيام</th>
                <th className="text-right py-2 px-2">سعر</th>
                <th className="text-right py-2 px-2">القسم</th>
                <th className="text-right py-2 px-2">حالة</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-2">{p.label_ar}</td>
                  <td className="py-2 px-2">{p.duration_days}</td>
                  <td className="py-2 px-2">{p.price.toFixed(2)}</td>
                  <td className="py-2 px-2">{p.category_scope}</td>
                  <td className="py-2 px-2">
                    <button
                      type="button"
                      onClick={() => void togglePackage(p.id, !p.is_active)}
                      className={p.is_active ? "text-emerald-600" : "text-gray-500"}
                    >
                      {p.is_active ? "نشطة" : "معطّلة"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إعلانات حديثة (إيقاف طوارئ)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-600">
                <th className="text-right py-2 px-2">الشركة</th>
                <th className="text-right py-2 px-2">العنوان</th>
                <th className="text-right py-2 px-2">الحالة</th>
                <th className="text-right py-2 px-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-2 px-2">{l.company_name}</td>
                  <td className="py-2 px-2">{l.title_ar}</td>
                  <td className="py-2 px-2">{l.status}</td>
                  <td className="py-2 px-2">
                    {l.status === "active" && (
                      <button type="button" onClick={() => void stopListing(l.id)} className="text-red-600 text-xs underline">
                        إيقاف
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type PackageRow = {
  id: string;
  label_ar: string;
  duration_days: number;
  price: number;
  category_scope: string;
};

type ListingRow = {
  id: string;
  title_ar: string;
  category: string;
  status: string;
  list_price: number | null;
  contact_phone: string;
  contact_whatsapp: string | null;
  image_url: string | null;
  image_blob_url?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  auto_renew: boolean;
  package_id: string;
  item_id: string | null;
};

type ItemOpt = { id: string; name: string; sale_price: number };

export function MarketplaceContent({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [items, setItems] = useState<ItemOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<"parts" | "workshop">("parts");
  const [form, setForm] = useState({
    title_ar: "",
    description_ar: "",
    list_price: "",
    package_id: "",
    item_id: "",
    contact_phone: "",
    contact_whatsapp: "",
    image_url: "",
    image_blob_url: "",
    auto_renew: false,
  });
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    if (isSuperAdmin) return;
    setLoading(true);
    try {
      const [pRes, lRes, iRes] = await Promise.all([
        fetch(`/api/admin/marketplace/packages?category=${category}`),
        fetch("/api/admin/marketplace/listings"),
        fetch("/api/admin/inventory/items?limit=300&offset=0"),
      ]);
      if (pRes.ok) {
        const d = await pRes.json();
        setPackages(d.packages ?? []);
      }
      if (lRes.ok) {
        const d = await lRes.json();
        setListings(d.listings ?? []);
      }
      if (iRes.ok) {
        const d = await iRes.json();
        const list = Array.isArray(d) ? d : (d.items ?? []);
        setItems(
          list.map((x: { id: string; name: string; sale_price?: number }) => ({
            id: x.id,
            name: x.name,
            sale_price: Number(x.sale_price ?? 0),
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [category, isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectedPackage(): PackageRow | undefined {
    return packages.find((p) => p.id === form.package_id);
  }

  async function submitCreate() {
    const pkg = selectedPackage();
    if (!pkg || !form.title_ar.trim() || !form.contact_phone.trim()) {
      alert("أكمل الحقول المطلوبة والباقة");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_ar: form.title_ar.trim(),
          description_ar: form.description_ar.trim() || undefined,
          list_price: form.list_price ? Number(form.list_price) : undefined,
          category,
          package_id: form.package_id,
          item_id: form.item_id || undefined,
          contact_phone: form.contact_phone.trim(),
          contact_whatsapp: form.contact_whatsapp.trim() || undefined,
          image_url: form.image_url.trim() || undefined,
          image_blob_url:
            form.image_blob_url &&
            form.image_url.trim() === form.image_blob_url.trim()
              ? form.image_blob_url.trim()
              : undefined,
          auto_renew: form.auto_renew,
          confirm: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "فشل");
        return;
      }
      setConfirmOpen(false);
      setForm({
        title_ar: "",
        description_ar: "",
        list_price: "",
        package_id: "",
        item_id: "",
        contact_phone: form.contact_phone,
        contact_whatsapp: form.contact_whatsapp,
        image_url: "",
        image_blob_url: "",
        auto_renew: false,
      });
      await load();
      alert(`تم نشر الإعلان حتى ${d.ends_at ?? ""}. الرصيد الجديد تقريباً: ${Number(d.new_balance).toFixed(2)} ج.م`);
    } finally {
      setSaving(false);
    }
  }

  async function renew(id: string) {
    const pkg = listings.find((l) => l.id === id);
    if (!pkg) return;
    if (!confirm(`تجديد الإعلان «${pkg.title_ar}» بخصم من المحفظة حسب الباقة الحالية؟`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/marketplace/listings/${id}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "فشل");
        return;
      }
      await load();
      alert(`تم التجديد حتى ${d.ends_at}. الرصيد: ${Number(d.new_balance).toFixed(2)} ج.م`);
    } finally {
      setSaving(false);
    }
  }

  async function cancelListing(id: string) {
    if (!confirm("إلغاء الإعلان وإزالته من السوق؟")) return;
    const res = await fetch(`/api/admin/marketplace/listings/${id}`, { method: "DELETE" });
    if (res.ok) await load();
    else alert((await res.json()).error || "فشل");
  }

  async function setAutoRenew(id: string, v: boolean) {
    const res = await fetch(`/api/admin/marketplace/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_renew: v }),
    });
    if (res.ok) await load();
  }

  if (isSuperAdmin) {
    return <SuperMarketplaceAdmin />;
  }

  const pkg = selectedPackage();

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
        <strong>تنبيه قانوني:</strong> السوق للعرض والتواصل فقط. EFCT لا يتدخل في البيع أو الشراء. الأسعار المعروضة إرشادية.
        الخصم من المحفظة يتطلب موافقتك الصريحة في نافذة التأكيد.
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إعلان جديد</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">قسم العرض</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as "parts" | "workshop")}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            >
              <option value="parts">قطع غيار</option>
              <option value="workshop">مستلزمات ومعدات ورشة</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">الباقة *</label>
            <select
              value={form.package_id}
              onChange={(e) => setForm((f) => ({ ...f, package_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            >
              <option value="">— اختر —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label_ar} — {p.price.toFixed(2)} ج.م / {p.duration_days} يوم
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">صنف من المخزن (اختياري)</label>
            <select
              value={form.item_id}
              onChange={(e) => {
                const id = e.target.value;
                const it = items.find((x) => x.id === id);
                setForm((f) => ({
                  ...f,
                  item_id: id,
                  title_ar: it && !f.title_ar ? it.name : f.title_ar,
                  list_price: it && !f.list_price ? String(it.sale_price) : f.list_price,
                }));
              }}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            >
              <option value="">— بدون ربط بصنف —</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">عنوان الإعلان *</label>
            <input
              value={form.title_ar}
              onChange={(e) => setForm((f) => ({ ...f, title_ar: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">الوصف</label>
            <textarea
              value={form.description_ar}
              onChange={(e) => setForm((f) => ({ ...f, description_ar: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">سعر إرشادي (ج.م)</label>
            <input
              type="number"
              step="0.01"
              value={form.list_price}
              onChange={(e) => setForm((f) => ({ ...f, list_price: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">هاتف للتواصل *</label>
            <input
              value={form.contact_phone}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">واتساب (رقم بصيغة دولية بدون +)</label>
            <input
              value={form.contact_whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, contact_whatsapp: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              dir="ltr"
              placeholder="2010..."
            />
          </div>
          <div className="md:col-span-2">
            <MarketplaceImageField
              imageUrl={form.image_url}
              imageBlobUrl={form.image_blob_url}
              onChange={({ imageUrl, imageBlobUrl }) =>
                setForm((f) => ({ ...f, image_url: imageUrl, image_blob_url: imageBlobUrl }))
              }
              inputClass="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
            <input
              type="checkbox"
              checked={form.auto_renew}
              onChange={(e) => setForm((f) => ({ ...f, auto_renew: e.target.checked }))}
            />
            تجديد تلقائي عند انتهاء المدة (يُخصم من المحفظة إن كفى الرصيد؛ وإلا يُوقف الإعلان)
          </label>
        </div>
        <button
          type="button"
          disabled={saving || !pkg}
          onClick={() => setConfirmOpen(true)}
          className="mt-4 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg font-medium"
        >
          متابعة والموافقة على الخصم
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إعلاناتي</h2>
        {loading ? (
          <p className="text-gray-500">جاري التحميل...</p>
        ) : listings.length === 0 ? (
          <p className="text-gray-500">لا توجد إعلانات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-right py-2 px-2">العنوان</th>
                  <th className="text-right py-2 px-2">الحالة</th>
                  <th className="text-right py-2 px-2">حتى</th>
                  <th className="text-right py-2 px-2">تجديد تلقائي</th>
                  <th className="text-right py-2 px-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-2">{l.title_ar}</td>
                    <td className="py-2 px-2">{l.status}</td>
                    <td className="py-2 px-2 text-xs">{l.ends_at || "—"}</td>
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={l.auto_renew}
                        onChange={(e) => void setAutoRenew(l.id, e.target.checked)}
                        disabled={l.status === "cancelled"}
                      />
                    </td>
                    <td className="py-2 px-2 flex flex-wrap gap-2">
                      {(l.status === "active" || l.status === "expired") && (
                        <button
                          type="button"
                          onClick={() => void renew(l.id)}
                          className="text-emerald-600 hover:underline text-xs"
                        >
                          تجديد
                        </button>
                      )}
                      {l.status === "active" && (
                        <button
                          type="button"
                          onClick={() => void cancelListing(l.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmOpen && pkg && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-2">تأكيد الخصم من المحفظة</h3>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-4">
              <li>
                <strong>الباقة:</strong> {pkg.label_ar}
              </li>
              <li>
                <strong>المبلغ:</strong> {pkg.price.toFixed(2)} ج.م
              </li>
              <li>
                <strong>المدة:</strong> {pkg.duration_days} يوماً
              </li>
            </ul>
            <p className="text-xs text-gray-500 mb-4">
              بالضغط على «أوافق» تُخصم القيمة فوراً وتُنشر الإعلان في السوق العام.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
              >
                رجوع
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitCreate()}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white font-medium disabled:opacity-50"
              >
                {saving ? "..." : "أوافق على الخصم والنشر"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
