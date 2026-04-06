"use client";

import { useState, useEffect, useRef } from "react";

export function CompanySettingsContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  /** رابط الشعار الحالي أو المُدخل يدوياً (https فقط) */
  const [logoLinkInput, setLogoLinkInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    tax_number: "",
    commercial_registration: "",
  });

  function emitBranding(name: string, url: string | null) {
    window.dispatchEvent(
      new CustomEvent("alameen-company-updated", { detail: { name, logo_url: url } })
    );
  }

  const previewLogoSrc =
    logoLinkInput.trim().startsWith("https://") ? logoLinkInput.trim() : null;

  useEffect(() => {
    fetch("/api/admin/company")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setMessage({ type: "error", text: d.error });
        } else {
          setForm({
            name: d.name ?? "",
            phone: d.phone ?? "",
            address: d.address ?? "",
            tax_number: d.tax_number ?? "",
            commercial_registration: d.commercial_registration ?? "",
          });
          setLogoLinkInput(d.logo_url?.trim() ? String(d.logo_url) : "");
        }
      })
      .catch(() => setMessage({ type: "error", text: "فشل تحميل البيانات" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        logo_url: logoLinkInput.trim() || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage({ type: "error", text: data.error || "فشل التحديث" });
    } else {
      setMessage({ type: "success", text: data.message || "تم الحفظ بنجاح" });
      emitBranding(form.name, logoLinkInput.trim() || null);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="text-gray-500">جاري التحميل...</div>;
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/company/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "فشل رفع الشعار" });
        return;
      }
      const url = data.logo_url as string;
      setLogoLinkInput(url);
      setMessage({ type: "success", text: "تم حفظ شعار الشركة — يظهر في القائمة الجانبية وطباعة الفاتورة." });
      emitBranding(form.name, url);
    } catch {
      setMessage({ type: "error", text: "فشل رفع الشعار" });
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    setLogoUploading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/company/logo", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "فشل الإزالة" });
        return;
      }
      setLogoLinkInput("");
      setMessage({ type: "success", text: "تمت إزالة الشعار." });
      emitBranding(form.name, null);
    } catch {
      setMessage({ type: "error", text: "فشل الإزالة" });
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4">
      {message && (
        <div
          className={`p-4 rounded-lg dark:border ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">شعار الشركة</label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-relaxed">
            يظهر في القائمة الجانبية كخلفية خفيفة خلف اسم الشركة. في الفاتورة: صورة صغيرة بجوار «بيانات الشركة» على الشاشة وعند الطباعة. يُفضّل شعار بخلفية شفافة.
          </p>
          <div className="mb-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              رابط الشعار (https) — اختياري إن رغبت برابط مباشر لملف الصورة
            </label>
            <input
              type="url"
              inputMode="url"
              dir="ltr"
              value={logoLinkInput}
              onChange={(e) => setLogoLinkInput(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>
          {previewLogoSrc && (
            <div className="mb-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewLogoSrc}
                alt=""
                className="h-16 w-16 object-contain rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 p-1"
                onError={() => setMessage({ type: "error", text: "تعذر تحميل معاينة الرابط — تحقق أن الرابط يفتح صورة مباشرة." })}
              />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadLogo(f);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={logoUploading}
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg"
            >
              {logoUploading ? "جاري الرفع..." : previewLogoSrc ? "تغيير الملف" : "رفع ملف من الجهاز"}
            </button>
            {previewLogoSrc && (
              <button
                type="button"
                disabled={logoUploading}
                onClick={() => void removeLogo()}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                إزالة الشعار
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اسم الشركة</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
        <input
          type="text"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          placeholder="مثال: 01009376052"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          placeholder="عنوان الشركة"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">رقم البطاقة الضريبية</label>
        <input
          type="text"
          value={form.tax_number}
          onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          placeholder="إن وجد"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">رقم السجل التجاري</label>
        <input
          type="text"
          value={form.commercial_registration}
          onChange={(e) => setForm((f) => ({ ...f, commercial_registration: e.target.value }))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          placeholder="إن وجد"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
      </button>
    </form>
  );
}
