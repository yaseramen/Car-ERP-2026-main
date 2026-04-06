"use client";

import { useState } from "react";
import Link from "next/link";
import { useDeviceFingerprint } from "@/hooks/use-device-fingerprint";

export default function RegisterPage() {
  const deviceFingerprint = useDeviceFingerprint();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    company_name: "",
    business_type: "both" as "sales_only" | "service_only" | "both" | "supplier",
    accept_terms: false,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accept_terms) {
      setError("يجب الموافقة على سياسة الاستخدام وشروط الخدمة للمتابعة");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          device_fingerprint: deviceFingerprint || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }
      setSuccess(true);
    } catch {
      setError("حدث خطأ. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-emerald-600 mb-4">تم إنشاء الحساب بنجاح</h1>
          <p className="text-gray-600 mb-6">يمكنك الآن تسجيل الدخول للوصول إلى لوحة التحكم.</p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg"
          >
            تسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">EFCT</h1>
        <p className="text-gray-500 mt-2">تسجيل شركة جديدة</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">اسم الشركة *</label>
          <input
            type="text"
            required
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500"
            placeholder="مثال: مركز EFCT للسيارات"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">نوع النشاط *</label>
          <select
            value={form.business_type}
            onChange={(e) => setForm((f) => ({ ...f, business_type: e.target.value as typeof form.business_type }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500"
          >
            <option value="both">بيع وشراء + مركز خدمة (الاثنين معاً)</option>
            <option value="sales_only">محل بيع وشراء فقط</option>
            <option value="service_only">مركز خدمة فقط</option>
            <option value="supplier">
              مورّد — محل قطع غيار للحسابات (بدون ورشة)؛ السوق والإعلانات تُفعّل لاحقاً من الإدارة
            </option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">اسم صاحب الشركة *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500"
            placeholder="الاسم الكامل"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني *</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500"
            placeholder="example@email.com"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور *</label>
          <input
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500"
            placeholder="6 أحرف على الأقل"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500"
            placeholder="01xxxxxxxxx"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.accept_terms}
            onChange={(e) => setForm((f) => ({ ...f, accept_terms: e.target.checked }))}
            className="mt-1 rounded border-gray-300"
          />
          <span className="text-sm text-gray-600">
            أوافق على{" "}
            <Link href="/terms" target="_blank" className="text-emerald-600 hover:underline">
              سياسة الاستخدام وشروط الخدمة
            </Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg"
        >
          {loading ? "جاري التسجيل..." : "إنشاء الحساب"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        لديك حساب؟{" "}
        <Link href="/login" className="text-emerald-600 hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
