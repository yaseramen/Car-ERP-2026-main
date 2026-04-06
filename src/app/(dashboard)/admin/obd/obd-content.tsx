"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { parseSymptomsColumn } from "@/lib/obd-symptoms-parse";
import { OBD_REFERENCE_LINKS } from "@/lib/obd-ai-context";

type ObdResult = {
  code: string;
  description_ar: string | null;
  description_en: string | null;
  causes: string | null;
  solutions: string | null;
  symptoms: string | null;
  source: string;
  cost: number;
};

type IntegratedStep = {
  priority: number;
  title: string;
  detail: string;
  related_codes?: string[];
};

type CodeRelation = {
  from: string;
  to: string;
  relation_ar: string;
};

type PerCodeWorkshopLine = {
  code: string;
  role_ar: string;
};

type IntegratedAnalysis = {
  summary_ar: string;
  per_code_analysis?: PerCodeWorkshopLine[];
  code_relations: CodeRelation[];
  root_cause_ar?: string;
  excluded_causes_ar?: string;
  cascade_ar: string;
  prioritized_steps: IntegratedStep[];
  common_mistakes_ar?: string;
  replacement_guidance_ar?: string;
  disclaimer_ar: string;
};

export function ObdContent({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const [mode, setMode] = useState<"search" | "upload" | "manualBatch" | "description" | "liveData" | "manage" | "logs">("search");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<{ aiAvailable: boolean; message: string; providers?: string[] } | null>(null);
  const [result, setResult] = useState<ObdResult | null>(null);
  const [analyzeResults, setAnalyzeResults] = useState<{
    results: ObdResult[];
    totalCost: number;
    codesFound: number;
    vehicle?: { brand: string; model: string; year: number | null; vin: string };
    integrated_analysis?: IntegratedAnalysis | null;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [descForm, setDescForm] = useState({ description: "", brand: "", model: "", year: "" });
  const [descResult, setDescResult] = useState<{
    summary_ar: string;
    possible_codes: string[];
    hypothesis_ar?: string;
    root_cause_ar?: string;
    excluded_causes_ar?: string;
    causes: string;
    solutions: string;
    prioritized_steps?: { priority: number; title: string; detail: string }[];
    common_mistakes_ar?: string;
    replacement_guidance_ar?: string;
    recommendations: string;
    disclaimer_ar?: string;
    cost: number;
    analysis_type?: "description" | "live_data";
  } | null>(null);
  const [liveForm, setLiveForm] = useState({ liveDataText: "", brand: "", model: "", year: "" });
  const [manualBatchForm, setManualBatchForm] = useState({ codesText: "", brand: "", model: "", year: "" });
  const [liveFile, setLiveFile] = useState<File | null>(null);
  const liveFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/obd/status")
      .then((r) => r.json())
      .then((d) => setAiStatus({ aiAvailable: d.aiAvailable, message: d.message, providers: d.providers }))
      .catch(() => setAiStatus({ aiAvailable: false, message: "تعذر التحقق" }));
  }, []);

  useEffect(() => {
    if (!isSuperAdmin && (mode === "manage" || mode === "logs")) {
      setMode("search");
    }
  }, [isSuperAdmin, mode]);

  const handlePrintObdAnalysis = useCallback(() => {
    document.body.classList.add("obd-printing-root");
    const cleanup = () => {
      document.body.classList.remove("obd-printing-root");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(() => {
      if (document.body.classList.contains("obd-printing-root")) cleanup();
    }, 3000);
  }, []);

  const handlePrintDescAnalysis = useCallback(() => {
    document.body.classList.add("obd-printing-desc-root");
    const cleanup = () => {
      document.body.classList.remove("obd-printing-desc-root");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(() => {
      if (document.body.classList.contains("obd-printing-desc-root")) cleanup();
    }, 3000);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setResult(null);
    setAnalyzeResults(null);
    try {
      const res = await fetch("/api/admin/obd/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في البحث");
        return;
      }

      setResult(data);
    } catch {
      alert("حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!manualBatchForm.codesText.trim()) return;

    setLoading(true);
    setResult(null);
    setAnalyzeResults(null);
    try {
      const res = await fetch("/api/admin/obd/analyze-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codes_text: manualBatchForm.codesText,
          vehicle_brand: manualBatchForm.brand.trim(),
          vehicle_model: manualBatchForm.model.trim(),
          vehicle_year: manualBatchForm.year.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل التحليل");
        return;
      }
      if (data.results && data.totalCost != null && data.codesFound != null) {
        setAnalyzeResults({
          results: data.results,
          totalCost: data.totalCost,
          codesFound: data.codesFound,
          vehicle: data.vehicle,
          integrated_analysis: data.integrated_analysis ?? null,
        });
        setMode("logs");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResult(null);
    setAnalyzeResults(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/obd/analyze", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();
      let data: {
        error?: string;
        results?: ObdResult[];
        totalCost?: number;
        codesFound?: number;
        vehicle?: { brand: string; model: string; year: number | null; vin: string };
        integrated_analysis?: IntegratedAnalysis | null;
      } = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || "استجابة غير صالحة" };
      }
      if (!res.ok) {
        alert(data.error || "فشل في تحليل الملف");
        return;
      }

      if (data.results && data.totalCost != null && data.codesFound != null) {
        setAnalyzeResults({
          results: data.results,
          totalCost: data.totalCost,
          codesFound: data.codesFound,
          vehicle: data.vehicle,
          integrated_analysis: data.integrated_analysis ?? null,
        });
        setMode("logs");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ";
      alert(`فشل في التحليل: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeByDescription(e: React.FormEvent) {
    e.preventDefault();
    if (!descForm.description.trim()) return;

    setLoading(true);
    setDescResult(null);
    setResult(null);
    setAnalyzeResults(null);
    try {
      const res = await fetch("/api/admin/obd/analyze-by-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: descForm.description.trim(),
          brand: descForm.brand.trim() || undefined,
          model: descForm.model.trim() || undefined,
          year: descForm.year.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في التحليل");
        return;
      }
      setDescResult({ ...data, analysis_type: "description" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeLiveData(e: React.FormEvent) {
    e.preventDefault();
    if (!liveForm.liveDataText.trim() && !liveFile) {
      alert("الصق نص القراءات، أو اختر ملفاً نصياً/CSV، أو صورة شاشة السكانر (JPG/PNG/WebP)");
      return;
    }

    setLoading(true);
    setDescResult(null);
    setResult(null);
    setAnalyzeResults(null);
    try {
      const formData = new FormData();
      if (liveForm.liveDataText.trim()) formData.append("liveDataText", liveForm.liveDataText.trim());
      if (liveFile) formData.append("file", liveFile);
      if (liveForm.brand.trim()) formData.append("brand", liveForm.brand.trim());
      if (liveForm.model.trim()) formData.append("model", liveForm.model.trim());
      if (liveForm.year.trim()) formData.append("year", liveForm.year.trim());

      const res = await fetch("/api/admin/obd/analyze-live-data", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل في التحليل");
        return;
      }
      setDescResult(data);
      setMode("description");
    } catch (err) {
      alert(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  function ResultCard({ r }: { r: ObdResult }) {
    const extra = r.symptoms ? parseSymptomsColumn(r.symptoms) : null;
    const severityClass =
      extra?.severity === "عالي"
        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
        : extra?.severity === "متوسط"
          ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
          : extra?.severity === "منخفض"
            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
            : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center flex-wrap gap-2">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">كود {r.code}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {extra?.severity && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityClass}`}>
                خطورة: {extra.severity}
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              المصدر: {r.source === "local" ? "محلي" : r.source === "ai" ? "أداة EFCT" : "غير موجود"} — {r.cost} ج.م
            </span>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {r.description_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الوصف</h3>
              <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{r.description_ar}</p>
            </div>
          )}
          {extra?.affected_system_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">النظام المتأثر</h3>
              <p className="text-gray-900 dark:text-gray-100">{extra.affected_system_ar}</p>
            </div>
          )}
          {extra?.severity_note_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">تبرير درجة الخطورة</h3>
              <p className="text-gray-900 dark:text-gray-100 text-sm">{extra.severity_note_ar}</p>
            </div>
          )}
          {r.causes && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الأسباب المحتملة (حسب الشيوع)</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-900 dark:text-gray-100">
                {r.causes.split("|").map((c, i) => (
                  <li key={i}>{c.trim()}</li>
                ))}
              </ul>
            </div>
          )}
          {extra?.testing_steps && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">طريقة الفحص (خطوة بخطوة)</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-900 dark:text-gray-100">
                {extra.testing_steps.split("|").map((s, i) => (
                  <li key={i}>{s.trim()}</li>
                ))}
              </ul>
            </div>
          )}
          {r.solutions && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الحلول (من الأسهل للأصعب)</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-900 dark:text-gray-100">
                {r.solutions.split("|").map((s, i) => (
                  <li key={i}>{s.trim()}</li>
                ))}
              </ul>
            </div>
          )}
          {extra?.symptoms && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الأعراض وإشارات التأكيد</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-900 dark:text-gray-100">
                {(extra.symptoms.includes("|") ? extra.symptoms.split("|") : extra.symptoms.split("\n")).map((s, i) => (
                  <li key={i}>{s.trim()}</li>
                ))}
              </ul>
            </div>
          )}
          {extra?.how_to_confirm_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">كيف يؤكد الفني</h3>
              <p className="text-gray-900 dark:text-gray-100 text-sm whitespace-pre-wrap">{extra.how_to_confirm_ar}</p>
            </div>
          )}
          {!extra && r.symptoms && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الأعراض</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-900 dark:text-gray-100">
                {r.symptoms.split("|").map((s, i) => (
                  <li key={i}>{s.trim()}</li>
                ))}
              </ul>
            </div>
          )}
          {extra?.repair_vs_replace_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">إصلاح مقابل استبدال</h3>
              <p className="text-gray-900 dark:text-gray-100 text-sm whitespace-pre-wrap">{extra.repair_vs_replace_ar}</p>
            </div>
          )}
          {extra?.prevention_tips_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">منع تكرار المشكلة</h3>
              <p className="text-gray-900 dark:text-gray-100 text-sm whitespace-pre-wrap">{extra.prevention_tips_ar}</p>
            </div>
          )}
          {extra?.professional_notes_ar && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">ملاحظات احترافية وأخطاء شائعة</h3>
              <p className="text-gray-900 dark:text-gray-100 text-sm whitespace-pre-wrap">{extra.professional_notes_ar}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {aiStatus && !aiStatus.aiAvailable && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-800 dark:text-amber-200">
          <p className="font-medium">⚠️ أداة التحليل في EFCT غير متاحة حالياً</p>
          <p className="text-sm mt-1">{aiStatus.message}</p>
        </div>
      )}
      {aiStatus && aiStatus.aiAvailable && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-2 text-emerald-800 dark:text-emerald-200 text-sm">
          ✓ {aiStatus.message}
        </div>
      )}
      <div className="-mx-1 px-1 overflow-x-auto overscroll-x-contain pb-2 border-b border-gray-200 dark:border-gray-700 touch-pan-x">
        <div className="flex flex-nowrap gap-2 min-w-min">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
            mode === "search" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          بحث بكود واحد
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
            mode === "upload" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          رفع تقرير (PDF أو صورة)
        </button>
        <button
          type="button"
          onClick={() => setMode("manualBatch")}
          className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
            mode === "manualBatch" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          أكواد يدوية + المركبة
        </button>
        <button
          type="button"
          onClick={() => setMode("description")}
          className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
            mode === "description" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          تحليل بالوصف
        </button>
        <button
          type="button"
          onClick={() => setMode("liveData")}
          className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
            mode === "liveData" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          قراءات حية / لقطة سكانر
        </button>
        {isSuperAdmin && (
          <>
            <button
              type="button"
              onClick={() => setMode("manage")}
              className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
                mode === "manage" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              إدارة قاعدة البيانات
            </button>
            <button
              type="button"
              onClick={() => setMode("logs")}
              className={`shrink-0 px-3 py-2.5 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-colors whitespace-nowrap touch-manipulation ${
                mode === "logs" ? "bg-emerald-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              سجلات التحليل
            </button>
          </>
        )}
        </div>
      </div>

      {mode === "search" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="مثال: P0100 أو P0171"
              className={`${inputClass} flex-1 min-h-[48px] touch-manipulation`}
              dir="ltr"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 min-h-[48px] px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors touch-manipulation"
            >
              {loading ? "جاري البحث..." : "بحث"}
            </button>
          </form>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            تكلفة كل بحث: 1 ج.م (تُخصم من محفظة الشركة)
          </p>
        </div>
      )}

      {mode === "description" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            صف مشكلة السيارة بدون جهاز كشف أعطال — يحلّلها برنامج EFCT ويقترح الأسباب والحلول والأكواد المحتملة.
          </p>
          <form onSubmit={handleAnalyzeByDescription} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">وصف الحالة *</label>
              <textarea
                value={descForm.description}
                onChange={(e) => setDescForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="مثال: المحرك يهتز عند التوقف، أو السيارة لا تشتغل في الصباح البارد، أو لمبة التحذير مضيئة..."
                className={inputClass}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الماركة (اختياري)</label>
                <input
                  type="text"
                  value={descForm.brand}
                  onChange={(e) => setDescForm((f) => ({ ...f, brand: e.target.value }))}
                  placeholder="Toyota, Mitsubishi..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">النموذج (اختياري)</label>
                <input
                  type="text"
                  value={descForm.model}
                  onChange={(e) => setDescForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="Camry, Mirage..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">سنة الصنع (اختياري)</label>
                <input
                  type="text"
                  value={descForm.year}
                  onChange={(e) => setDescForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="2020"
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg"
            >
              {loading ? "جاري التحليل..." : "تحليل"}
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400">تكلفة التحليل: 1 ج.م</p>
          </form>
          {descResult && (
            <div
              id="obd-desc-print-area"
              className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-4 border border-gray-200 dark:border-gray-600"
            >
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">نتيجة التحليل — {descResult.cost} ج.م</h3>
                  {descResult.analysis_type === "live_data" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">
                      قراءات حية / لقطة نصية
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handlePrintDescAnalysis}
                  className="no-print px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  طباعة التحليل
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 no-print">
                منهج ورشة: أبسط الأسباب أولاً، أكواد محتملة كدليل فقط حتى يُفحص بالجهاز.
              </p>
              {descResult.summary_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الملخص</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{descResult.summary_ar}</p>
                </div>
              )}
              {descResult.hypothesis_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">فرضية العمل</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{descResult.hypothesis_ar}</p>
                </div>
              )}
              {descResult.root_cause_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">السبب الجذري الأرجح</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{descResult.root_cause_ar}</p>
                </div>
              )}
              {descResult.excluded_causes_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">ما يُستبعد ولماذا</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{descResult.excluded_causes_ar}</p>
                </div>
              )}
              {descResult.possible_codes?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">أكواد OBD محتملة (دليل)</p>
                  <p className="text-gray-900 dark:text-gray-100" dir="ltr">
                    {descResult.possible_codes.join(", ")}
                  </p>
                </div>
              )}
              {descResult.prioritized_steps && descResult.prioritized_steps.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">خطة تشخيص (5–7 خطوات)</p>
                  <ol className="list-decimal list-inside space-y-2 text-gray-900 dark:text-gray-100">
                    {[...descResult.prioritized_steps]
                      .sort((a, b) => a.priority - b.priority)
                      .map((step, i) => (
                        <li key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-white/50 dark:bg-gray-800/50">
                          <span className="font-medium">{step.title}</span>
                          <p className="text-sm mt-1">{step.detail}</p>
                        </li>
                      ))}
                  </ol>
                </div>
              )}
              {descResult.causes && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الأسباب المحتملة (حسب الأولوية)</p>
                  <ul className="list-disc list-inside text-gray-900 dark:text-gray-100 space-y-1">
                    {descResult.causes.split("|").map((c, i) => (
                      <li key={i}>{c.trim()}</li>
                    ))}
                  </ul>
                </div>
              )}
              {descResult.solutions && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الحلول المقترحة (حسب الأولوية)</p>
                  <ul className="list-disc list-inside text-gray-900 dark:text-gray-100 space-y-1">
                    {descResult.solutions.split("|").map((s, i) => (
                      <li key={i}>{s.trim()}</li>
                    ))}
                  </ul>
                </div>
              )}
              {descResult.common_mistakes_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">أخطاء شائعة للفني</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap text-sm">{descResult.common_mistakes_ar}</p>
                </div>
              )}
              {descResult.replacement_guidance_ar && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الاستبدال مقابل الفحص</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap text-sm">{descResult.replacement_guidance_ar}</p>
                </div>
              )}
              {descResult.recommendations && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">توصيات</p>
                  <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{descResult.recommendations}</p>
                </div>
              )}
              {descResult.disclaimer_ar && (
                <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  {descResult.disclaimer_ar}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {mode === "liveData" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            الصق نص القراءات من السكانر، أو ارفع ملف <span className="font-medium">.txt</span> / <span className="font-medium">.csv</span>، أو{" "}
            <span className="font-medium">صورة شاشة</span> (لقطة للشاشة بصيغة JPG أو PNG أو WebP — يُستخرج النص تلقائياً ثم يُحلَّل). يُحلّل ما وُجد في النص دون اختراع أرقام غير ظاهرة.
          </p>
          <form onSubmit={handleAnalyzeLiveData} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نص القراءات (لصق من السكانر)</label>
              <textarea
                value={liveForm.liveDataText}
                onChange={(e) => setLiveForm((f) => ({ ...f, liveDataText: e.target.value }))}
                placeholder={`مثال:\nRPM: 850\nCoolant: 92°C\nSTFT B1: +12%\nLTFT B1: +8%\nO2 B1S1: 0.85V ...`}
                className={inputClass}
                rows={10}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">أو ارفع ملف نصي / CSV / صورة شاشة (اختياري)</label>
              <input
                ref={liveFileInputRef}
                type="file"
                accept=".txt,.csv,image/jpeg,image/png,image/webp,image/gif,text/plain,text/csv"
                className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 dark:file:bg-emerald-900/40 dark:file:text-emerald-200"
                onChange={(e) => setLiveFile(e.target.files?.[0] ?? null)}
              />
              {liveFile && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">مختار: {liveFile.name}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الماركة (اختياري)</label>
                <input
                  type="text"
                  value={liveForm.brand}
                  onChange={(e) => setLiveForm((f) => ({ ...f, brand: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">النموذج (اختياري)</label>
                <input
                  type="text"
                  value={liveForm.model}
                  onChange={(e) => setLiveForm((f) => ({ ...f, model: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">سنة الصنع (اختياري)</label>
                <input
                  type="text"
                  value={liveForm.year}
                  onChange={(e) => setLiveForm((f) => ({ ...f, year: e.target.value }))}
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || (!liveForm.liveDataText.trim() && !liveFile)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-medium rounded-lg"
            >
              {loading ? "جاري التحليل..." : "تحليل القراءات"}
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              تكلفة التحليل: 1 ج.م. صورة القراءات هنا تُعرَّف نصياً ثم تُحلَّل — للتقارير الطويلة أو PDF استخدم تبويب «رفع تقرير».
            </p>
          </form>
        </div>
      )}

      {isSuperAdmin && mode === "manage" && <ObdManage inputClass={inputClass} />}

      {isSuperAdmin && mode === "logs" && <ObdLogs justAnalyzed={!!analyzeResults} />}

      {mode === "manualBatch" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            أدخل عدة أكواد دفعة واحدة (سطر لكل كود أو مفصولة بفواصل أو مسافات). اختر{" "}
            <strong>الماركة والموديل وسنة الصنع بالعربية</strong> ليربط النظام التحليل الموحّد والسجل بهذه المركبة
            ويُحدَّث جدول الماركات/النماذج تلقائياً.
          </p>
          <form onSubmit={handleAnalyzeBatch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الأكواد *</label>
              <textarea
                value={manualBatchForm.codesText}
                onChange={(e) => setManualBatchForm((f) => ({ ...f, codesText: e.target.value }))}
                placeholder={"P0300\nP0171\nC1211\nأو: P0300، P0171، C1211"}
                className={inputClass}
                rows={5}
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">نوع السيارة / الماركة (عربي)</label>
                <input
                  type="text"
                  value={manualBatchForm.brand}
                  onChange={(e) => setManualBatchForm((f) => ({ ...f, brand: e.target.value }))}
                  placeholder="مثال: ميتسوبيشي، تويوتا"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">الموديل (عربي)</label>
                <input
                  type="text"
                  value={manualBatchForm.model}
                  onChange={(e) => setManualBatchForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="مثال: لانسر، كامري"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">سنة الصنع</label>
                <input
                  type="text"
                  value={manualBatchForm.year}
                  onChange={(e) => setManualBatchForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="2015"
                  className={inputClass}
                  dir="ltr"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || !manualBatchForm.codesText.trim()}
              className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "جاري التحليل..." : "تحليل الأكواد وحفظ المركبة"}
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              تكلفة كل كود: 1 ج.م — يُحفظ التقرير في السجلات باسم «manual_codes» مع المركبة إن وُجدت. للبحث داخل قاعدة الأكواد حسب ماركة/سنة استخدم «إدارة قاعدة البيانات» بعد ربط الأكواد بالمركبة عند الإدخال اليدوي.
            </p>
          </form>
        </div>
      )}

      {mode === "upload" && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f && (f.type.startsWith("image/") || f.type === "application/pdf")) {
                  setFile(f);
                } else {
                  alert("يرجى رفع صورة (JPG, PNG, WebP) أو ملف PDF");
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30" : "border-gray-300 dark:border-gray-600 hover:border-emerald-400 dark:hover:border-emerald-500"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
              <p className="text-gray-600 dark:text-gray-300">
                {file ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">{file.name}</span>
                ) : (
                  <>اسحب الملف هنا أو انقر للاختيار — PDF أو صورة (حد أقصى 4 ميجابايت)</>
                )}
              </p>
            </div>
            <button
              type="submit"
              disabled={loading || !file}
              className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? "جاري التحليل..." : "تحليل التقرير"}
            </button>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              تكلفة كل كود: 1 ج.م — سيتم استخراج كل الأكواد من التقرير وتحليلها
            </p>
          </form>
        </div>
      )}

      {result && <ResultCard r={result} />}

      <div className="no-print text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/30">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">مراجع معيار الأكواد (للاطلاع)</p>
        <ul className="space-y-1 list-none">
          {OBD_REFERENCE_LINKS.map((ref) => (
            <li key={ref.url}>
              <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                {ref.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {analyzeResults && (
        <div id="obd-print-area" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg px-4 py-3 border border-emerald-100 dark:border-emerald-800">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              تم العثور على {analyzeResults.codesFound} كود — إجمالي التكلفة: {analyzeResults.totalCost} ج.م
            </span>
            <div className="flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={handlePrintObdAnalysis}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                طباعة التحليل
              </button>
            </div>
            {analyzeResults.vehicle && (analyzeResults.vehicle.brand || analyzeResults.vehicle.model || analyzeResults.vehicle.year) && (
              <span className="text-sm text-gray-600 dark:text-gray-300 w-full sm:w-auto">
                {[analyzeResults.vehicle.brand, analyzeResults.vehicle.model, analyzeResults.vehicle.year].filter(Boolean).join(" · ")}
                {analyzeResults.vehicle.vin && ` · VIN: ${analyzeResults.vehicle.vin}`}
              </span>
            )}
          </div>

          {!analyzeResults.integrated_analysis && analyzeResults.codesFound >= 1 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 no-print">
              «التحليل الموحّد» يُولَّد بواسطة أداة EFCT (يربط الأكواد معاً) وليس من القاعدة وحدها. فعّل{" "}
              <strong className="text-gray-700 dark:text-gray-300">GEMINI_API_KEY</strong> أو{" "}
              <strong className="text-gray-700 dark:text-gray-300">GROQ_API_KEY</strong> في الخادم — لا تكلفة إضافية على المحفظة.
            </p>
          )}
          {analyzeResults.integrated_analysis && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-emerald-200 dark:border-emerald-800 overflow-hidden print:border-gray-300">
              <div className="p-4 border-b border-emerald-100 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-900/20">
                <h2 className="font-bold text-lg text-emerald-900 dark:text-emerald-100">تحليل موحّد للتقرير (أداة EFCT)</h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  منهج ورشة: أبسط الأسباب أولاً، ربط الأكواد عند وجود دليل تقني، وخطة 5–7 خطوات — يُكمّل تفاصيل كل كود أدناه.
                </p>
              </div>
              <div className="p-6 space-y-5 text-gray-900 dark:text-gray-100">
                {analyzeResults.integrated_analysis.summary_ar && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">ملخص الأعطال</h3>
                    <p className="leading-relaxed whitespace-pre-wrap">{analyzeResults.integrated_analysis.summary_ar}</p>
                  </div>
                )}
                {analyzeResults.integrated_analysis.per_code_analysis &&
                  analyzeResults.integrated_analysis.per_code_analysis.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">تحليل منفصل لكل كود</h3>
                      <ul className="space-y-2 text-sm">
                        {analyzeResults.integrated_analysis.per_code_analysis.map((row, i) => (
                          <li key={i} className="border-r-2 border-gray-300 dark:border-gray-600 pr-3">
                            <span className="font-mono font-medium" dir="ltr">
                              {row.code}
                            </span>
                            <p className="mt-1 leading-relaxed">{row.role_ar}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                {analyzeResults.integrated_analysis.root_cause_ar && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">السبب الجذري الأرجح</h3>
                    <p className="leading-relaxed whitespace-pre-wrap">{analyzeResults.integrated_analysis.root_cause_ar}</p>
                  </div>
                )}
                {analyzeResults.integrated_analysis.excluded_causes_ar && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">ما يُستبعد ولماذا</h3>
                    <p className="leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {analyzeResults.integrated_analysis.excluded_causes_ar}
                    </p>
                  </div>
                )}
                {analyzeResults.integrated_analysis.cascade_ar && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">سلسلة العطل المحتملة</h3>
                    <p className="leading-relaxed whitespace-pre-wrap">{analyzeResults.integrated_analysis.cascade_ar}</p>
                  </div>
                )}
                {analyzeResults.integrated_analysis.code_relations?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">علاقة بين الأكواد</h3>
                    <ul className="space-y-2 text-sm">
                      {analyzeResults.integrated_analysis.code_relations.map((rel, i) => (
                        <li key={i} className="border-r-2 border-emerald-400 pr-3" dir="rtl">
                          <span className="font-mono text-xs" dir="ltr">
                            {rel.from} → {rel.to}
                          </span>
                          {rel.relation_ar && <p className="mt-1">{rel.relation_ar}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {analyzeResults.integrated_analysis.prioritized_steps?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">ابدأ بالترتيب (الأولوية)</h3>
                    <ol className="space-y-3 list-decimal list-inside pr-1">
                      {[...analyzeResults.integrated_analysis.prioritized_steps]
                        .sort((a, b) => a.priority - b.priority)
                        .map((step, i) => (
                          <li key={i} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/30">
                            <span className="font-medium">{step.title}</span>
                            <p className="mt-1 text-sm leading-relaxed">{step.detail}</p>
                            {step.related_codes && step.related_codes.length > 0 && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2" dir="ltr">
                                أكواد مرتبطة: {step.related_codes.join(", ")}
                              </p>
                            )}
                          </li>
                        ))}
                    </ol>
                  </div>
                )}
                {analyzeResults.integrated_analysis.common_mistakes_ar && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">أخطاء شائعة للفني</h3>
                    <p className="leading-relaxed whitespace-pre-wrap text-sm">{analyzeResults.integrated_analysis.common_mistakes_ar}</p>
                  </div>
                )}
                {analyzeResults.integrated_analysis.replacement_guidance_ar && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">الاستبدال مقابل الفحص</h3>
                    <p className="leading-relaxed whitespace-pre-wrap text-sm">
                      {analyzeResults.integrated_analysis.replacement_guidance_ar}
                    </p>
                  </div>
                )}
                {analyzeResults.integrated_analysis.disclaimer_ar && (
                  <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    {analyzeResults.integrated_analysis.disclaimer_ar}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {analyzeResults.results.map((r, i) => (
              <ResultCard key={i} r={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ObdManage({ inputClass }: { inputClass: string }) {
  const [brands, setBrands] = useState<{ id: string; name_ar: string; name_en: string | null }[]>([]);
  const [models, setModels] = useState<{ id: string; brand_id: string; name_ar: string; brand_name: string }[]>([]);
  const [newBrand, setNewBrand] = useState({ name_ar: "", name_en: "" });
  const [newModel, setNewModel] = useState({ brand_id: "", name_ar: "", name_en: "" });
  const [newCode, setNewCode] = useState({
    code: "",
    description_ar: "",
    causes: "",
    solutions: "",
    symptoms: "",
    vehicle_brand_id: "",
    vehicle_model_id: "",
    year_from: "",
    year_to: "",
  });
  const [codeBrowse, setCodeBrowse] = useState({ brand_id: "", model_id: "", year: "", q: "" });
  const [codeList, setCodeList] = useState<
    {
      id: string;
      code: string;
      description_ar: string | null;
      vehicle_brand_id: string | null;
      vehicle_model_id: string | null;
      year_from: number | null;
      year_to: number | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [loadingCodes, setLoadingCodes] = useState(false);

  useEffect(() => {
    fetch("/api/admin/obd/brands")
      .then((r) => r.json())
      .then(setBrands)
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/admin/obd/models")
      .then((r) => r.json())
      .then(setModels)
      .catch(() => {});
  }, []);

  async function loadCodesList() {
    setLoadingCodes(true);
    try {
      const params = new URLSearchParams();
      if (codeBrowse.q.trim()) params.set("q", codeBrowse.q.trim());
      if (codeBrowse.brand_id) params.set("brand_id", codeBrowse.brand_id);
      if (codeBrowse.model_id) params.set("model_id", codeBrowse.model_id);
      if (codeBrowse.year.trim() && /^\d{4}$/.test(codeBrowse.year.trim())) params.set("year", codeBrowse.year.trim());
      params.set("limit", "100");
      const r = await fetch(`/api/admin/obd/codes?${params}`);
      const data = await r.json();
      if (r.ok && Array.isArray(data)) setCodeList(data);
      else setCodeList([]);
    } catch {
      setCodeList([]);
    } finally {
      setLoadingCodes(false);
    }
  }

  useEffect(() => {
    loadCodesList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل أولي فقط
  }, []);

  async function addBrand(e: React.FormEvent) {
    e.preventDefault();
    if (!newBrand.name_ar.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/admin/obd/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBrand),
      });
      const data = await r.json();
      if (r.ok) {
        setBrands((b) => [...b, { id: data.id, name_ar: data.name_ar, name_en: data.name_en }]);
        setNewBrand({ name_ar: "", name_en: "" });
      } else alert(data.error || "فشل");
    } catch {
      alert("حدث خطأ");
    } finally {
      setLoading(false);
    }
  }
  async function addModel(e: React.FormEvent) {
    e.preventDefault();
    if (!newModel.name_ar.trim() || !newModel.brand_id) return;
    setLoading(true);
    try {
      const r = await fetch("/api/admin/obd/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newModel),
      });
      const data = await r.json();
      if (r.ok) {
        const brand = brands.find((b) => b.id === newModel.brand_id);
        setModels((m) => [...m, { id: data.id, brand_id: newModel.brand_id, name_ar: data.name_ar, brand_name: brand?.name_ar || "" }]);
        setNewModel({ ...newModel, name_ar: "", name_en: "" });
      } else alert(data.error || "فشل");
    } catch {
      alert("حدث خطأ");
    } finally {
      setLoading(false);
    }
  }
  async function addCode(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.code.trim()) return;
    setLoading(true);
    try {
      const r = await fetch("/api/admin/obd/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCode,
          vehicle_brand_id: newCode.vehicle_brand_id || null,
          vehicle_model_id: newCode.vehicle_model_id || null,
          year_from: newCode.year_from ? parseInt(newCode.year_from, 10) : null,
          year_to: newCode.year_to ? parseInt(newCode.year_to, 10) : null,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setNewCode({
          code: "",
          description_ar: "",
          causes: "",
          solutions: "",
          symptoms: "",
          vehicle_brand_id: "",
          vehicle_model_id: "",
          year_from: "",
          year_to: "",
        });
        alert("تمت إضافة الكود");
      } else alert(data.error || "فشل");
    } catch {
      alert("حدث خطأ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">ماركات المركبات</h3>
          <form onSubmit={addBrand} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newBrand.name_ar}
              onChange={(e) => setNewBrand((b) => ({ ...b, name_ar: e.target.value }))}
              placeholder="الاسم بالعربية"
              className={inputClass}
            />
            <input
              type="text"
              value={newBrand.name_en}
              onChange={(e) => setNewBrand((b) => ({ ...b, name_en: e.target.value }))}
              placeholder="الاسم بالإنجليزية"
              className={inputClass}
              dir="ltr"
            />
            <button type="submit" disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">
              إضافة
            </button>
          </form>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            {brands.map((b) => (
              <li key={b.id}>{b.name_ar}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">نماذج المركبات</h3>
          <form onSubmit={addModel} className="space-y-2 mb-4">
            <select
              value={newModel.brand_id}
              onChange={(e) => setNewModel((m) => ({ ...m, brand_id: e.target.value }))}
              className={inputClass}
            >
              <option value="">اختر الماركة</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name_ar}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="text"
                value={newModel.name_ar}
                onChange={(e) => setNewModel((m) => ({ ...m, name_ar: e.target.value }))}
                placeholder="النموذج بالعربية"
                className={inputClass}
              />
              <button type="submit" disabled={loading} className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">
                إضافة
              </button>
            </div>
          </form>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            {models.map((m) => (
              <li key={m.id}>{m.brand_name} — {m.name_ar}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">إضافة كود OBD يدوياً</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          اربط الكود بماركة/موديل/نطاق سنوات لتسهيل البحث لاحقاً عن أعطال سيارة معيّنة.
        </p>
        <form onSubmit={addCode} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={newCode.vehicle_brand_id}
              onChange={(e) => setNewCode((c) => ({ ...c, vehicle_brand_id: e.target.value, vehicle_model_id: "" }))}
              className={inputClass}
            >
              <option value="">ماركة المركبة (اختياري)</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
            <select
              value={newCode.vehicle_model_id}
              onChange={(e) => setNewCode((c) => ({ ...c, vehicle_model_id: e.target.value }))}
              className={inputClass}
              disabled={!newCode.vehicle_brand_id}
            >
              <option value="">الموديل (اختياري)</option>
              {models
                .filter((m) => m.brand_id === newCode.vehicle_brand_id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name_ar}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              inputMode="numeric"
              value={newCode.year_from}
              onChange={(e) => setNewCode((c) => ({ ...c, year_from: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              placeholder="سنة من (مثال 2010)"
              className={inputClass}
              dir="ltr"
            />
            <input
              type="text"
              inputMode="numeric"
              value={newCode.year_to}
              onChange={(e) => setNewCode((c) => ({ ...c, year_to: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              placeholder="سنة إلى (مثال 2018)"
              className={inputClass}
              dir="ltr"
            />
          </div>
          <input
            type="text"
            value={newCode.code}
            onChange={(e) => setNewCode((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
            placeholder="الكود (مثال: P0100 أو 01314 أو B3902-00)"
            className={inputClass}
            dir="ltr"
          />
          <input
            type="text"
            value={newCode.description_ar}
            onChange={(e) => setNewCode((c) => ({ ...c, description_ar: e.target.value }))}
            placeholder="الوصف بالعربية"
            className={inputClass}
          />
          <input
            type="text"
            value={newCode.causes}
            onChange={(e) => setNewCode((c) => ({ ...c, causes: e.target.value }))}
            placeholder="الأسباب (افصل بـ |)"
            className={inputClass}
          />
          <input
            type="text"
            value={newCode.solutions}
            onChange={(e) => setNewCode((c) => ({ ...c, solutions: e.target.value }))}
            placeholder="الحلول (افصل بـ |)"
            className={inputClass}
          />
          <input
            type="text"
            value={newCode.symptoms}
            onChange={(e) => setNewCode((c) => ({ ...c, symptoms: e.target.value }))}
            placeholder="الأعراض (افصل بـ |)"
            className={inputClass}
          />
          <button type="submit" disabled={loading} className="px-6 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">
            حفظ الكود
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
          <h4 className="font-bold text-gray-900 dark:text-gray-100 mb-2">بحث في الأكواد المحفوظة</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            فلترة حسب الماركة/الموديل/سنة الصنع (للأكواد التي رُبطت بها عند الإدخال)، أو بحث نصي بالكود أو الوصف.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <select
              value={codeBrowse.brand_id}
              onChange={(e) => setCodeBrowse((c) => ({ ...c, brand_id: e.target.value, model_id: "" }))}
              className={inputClass + " max-w-xs"}
            >
              <option value="">كل الماركات</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name_ar}
                </option>
              ))}
            </select>
            <select
              value={codeBrowse.model_id}
              onChange={(e) => setCodeBrowse((c) => ({ ...c, model_id: e.target.value }))}
              className={inputClass + " max-w-xs"}
              disabled={!codeBrowse.brand_id}
            >
              <option value="">كل الموديلات</option>
              {models
                .filter((m) => m.brand_id === codeBrowse.brand_id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name_ar}
                  </option>
                ))}
            </select>
            <input
              type="text"
              value={codeBrowse.year}
              onChange={(e) => setCodeBrowse((c) => ({ ...c, year: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
              placeholder="سنة"
              className={inputClass + " w-24"}
              dir="ltr"
            />
            <input
              type="text"
              value={codeBrowse.q}
              onChange={(e) => setCodeBrowse((c) => ({ ...c, q: e.target.value }))}
              placeholder="بحث: كود أو وصف"
              className={inputClass + " flex-1 min-w-[160px]"}
            />
            <button
              type="button"
              onClick={() => loadCodesList()}
              disabled={loadingCodes}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg disabled:opacity-50"
            >
              {loadingCodes ? "…" : "تطبيق"}
            </button>
          </div>
          {loadingCodes ? (
            <p className="text-sm text-gray-500">جاري التحميل...</p>
          ) : (
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 max-h-56 overflow-y-auto">
              {codeList.length === 0 && <li className="text-gray-500">لا نتائج</li>}
              {codeList.map((row) => (
                <li key={row.id} className="font-mono text-xs" dir="ltr">
                  {row.code}
                  {row.description_ar && (
                    <span className="text-gray-600 dark:text-gray-400 mr-2" dir="rtl">
                      {" "}
                      — {row.description_ar.slice(0, 60)}
                      {row.description_ar.length > 60 ? "…" : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ObdLogs({ justAnalyzed }: { justAnalyzed?: boolean }) {
  const [data, setData] = useState<{
    reports: { id: string; file_name: string; vehicle_brand: string | null; vehicle_model: string | null; vehicle_year: number | null; codes_count: number; total_cost: number; codes_extracted: string; created_at: string }[];
    stats: { reports_count: number; codes_count: number; searches_count: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchLogs() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/obd/reports");
      const d = await r.json();
      if (r.ok) setData(d);
    } catch {
      alert("تعذر تحميل السجلات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, []);

  if (loading) return <div className="p-6 text-gray-500 dark:text-gray-400">جاري التحميل...</div>;
  if (!data) return null;

  const { reports, stats } = data;

  return (
    <div className="space-y-6">
      {justAnalyzed && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 text-emerald-800 dark:text-emerald-200">
          ✓ تم حفظ التقرير تلقائياً في قاعدة البيانات
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-4 border border-emerald-100 dark:border-emerald-800">
          <p className="text-sm text-emerald-700 dark:text-emerald-300">تقارير مرفوعة</p>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{stats.reports_count}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-700 dark:text-blue-300">أكواد مخزنة</p>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.codes_count}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-4 border border-amber-100 dark:border-amber-800">
          <p className="text-sm text-amber-700 dark:text-amber-300">عمليات بحث</p>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{stats.searches_count}</p>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-bold text-gray-900 dark:text-gray-100">آخر التقارير المرفوعة</h3>
          <button onClick={fetchLogs} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
            تحديث
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 text-right">
                <th className="p-3 font-medium text-gray-600 dark:text-gray-300">الملف</th>
                <th className="p-3 font-medium text-gray-600 dark:text-gray-300">المركبة</th>
                <th className="p-3 font-medium text-gray-600 dark:text-gray-300">الأكواد</th>
                <th className="p-3 font-medium text-gray-600 dark:text-gray-300">التكلفة</th>
                <th className="p-3 font-medium text-gray-600 dark:text-gray-300">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500 dark:text-gray-400">
                    لا توجد تقارير مسجلة بعد
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="p-3 text-gray-900 dark:text-gray-100">{r.file_name}</td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">
                      {[r.vehicle_brand, r.vehicle_model, r.vehicle_year].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300" dir="ltr">
                      {r.codes_extracted
                        ? (() => {
                            try {
                              const arr = JSON.parse(r.codes_extracted);
                              return Array.isArray(arr) ? arr.join(", ") : r.codes_count;
                            } catch {
                              return r.codes_count;
                            }
                          })()
                        : r.codes_count}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300">{r.total_cost} ج.م</td>
                    <td className="p-3 text-gray-500 dark:text-gray-400">{new Date(r.created_at).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
