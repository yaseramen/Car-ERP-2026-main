"use client";

import { useState, useEffect } from "react";

type CompanyRow = {
  id: string;
  name: string;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
};

export default function SuperPasswordResetClient() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ code: string; expires_at: string; owner_email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/super/companies-owners")
      .then((r) => r.json())
      .then((d) => {
        setCompanies(d.companies ?? []);
        if (d.companies?.[0]?.id) setSelectedId(d.companies[0].id);
      })
      .catch(() => setError("فشل تحميل الشركات"))
      .finally(() => setLoading(false));
  }, []);

  async function generateCode() {
    if (!selectedId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/super/password-reset-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "فشل إنشاء الكود");
        return;
      }
      setResult({ code: data.code, expires_at: data.expires_at, owner_email: data.owner_email });
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!result?.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
    } catch {}
  }

  useEffect(() => {
    if (result?.code) {
      void copyCode();
    }
  }, [result?.code]);

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">أكواد استعادة كلمة مرور المالكين</h1>
      <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm leading-relaxed">
        لمالكي الشركات (<strong>tenant_owner</strong> فقط): أنشئ كوداً لمرة واحدة وأرسله للعميل عبر واتساب أو هاتف.
        يستخدم المالك الصفحة العامة{" "}
        <a href="/reset-password" className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">
          /reset-password
        </a>{" "}
        لإدخال البريد والكود وكلمة المرور الجديدة.
      </p>

      <div className="mt-8 bg-amber-50 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-100">
        <strong>كلمة مرور Super Admin</strong> لا تُستعاد من الواجهة. من الجهاز الذي يملك <code className="bg-white/60 dark:bg-black/30 px-1 rounded">.env</code> وصلاحية Turso:{" "}
        <code className="bg-white/60 dark:bg-black/30 px-1 rounded break-all">npx tsx scripts/reset-super-admin-password.ts البريد كلمة_المرور_الجديدة</code>
      </div>

      {loading ? (
        <p className="mt-6 text-gray-500">جاري التحميل...</p>
      ) : (
        <div className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">الشركة</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.owner_id}>
                  {c.name}
                  {!c.owner_id ? " (لا يوجد مالك)" : c.owner_email ? ` — ${c.owner_email}` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void generateCode()}
            disabled={generating || !selectedId || !companies.find((c) => c.id === selectedId)?.owner_id}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-lg"
          >
            {generating ? "جاري..." : "توليد كود جديد"}
          </button>

          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          {result && (
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">البريد: {result.owner_email}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                تنتهي الصلاحية: {new Date(result.expires_at).toLocaleString("ar-EG")}
              </p>
              <p className="text-xs text-gray-500">تم نسخ الكود للحافظة إن أمكن.</p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-lg font-mono font-bold tracking-widest bg-gray-100 dark:bg-gray-900 px-3 py-2 rounded">
                  {result.code}
                </code>
                <button type="button" onClick={() => void copyCode()} className="text-sm text-emerald-600 hover:underline">
                  نسخ مرة أخرى
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
