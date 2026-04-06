"use client";

import { useEffect, useState, useCallback } from "react";
import { FEEDBACK_SUPER_PENDING_BASELINE_KEY } from "@/lib/feedback-notification-keys";

type Row = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  screenshot_url: string | null;
  page_path: string | null;
  admin_reply: string | null;
  admin_replied_at: string | null;
  user_name: string;
  user_email: string;
  company_name: string;
};

const TYPE_AR: Record<string, string> = {
  bug: "خطأ",
  feature: "اقتراح",
  feedback: "ملاحظة",
};

export default function FeedbackInboxClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [statusDraft, setStatusDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/feedback");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل التحميل");
      setRows(d as Row[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل التحميل");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** عند فتح الصندوق: مزامنة خط الأساس حتى لا يُعاد تنبيه المطور لملاحظات قديمة */
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/admin/feedback/notify-summary");
        const d = await r.json();
        if (r.ok && typeof d.pendingCount === "number") {
          try {
            localStorage.setItem(FEEDBACK_SUPER_PENDING_BASELINE_KEY, String(d.pendingCount));
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function saveRow(id: string) {
    const status = statusDraft[id];
    const admin_reply = (replyDraft[id] ?? "").trim();
    const body: { status?: string; admin_reply?: string } = {};
    if (status) body.status = status;
    if (admin_reply) body.admin_reply = admin_reply;
    if (!body.status && !body.admin_reply) {
      alert("اكتب رداً أو غيّر الحالة ثم احفظ.");
      return;
    }
    setSavingId(id);
    try {
      const r = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "فشل الحفظ");
      await load();
      setOpenId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSavingId(null);
    }
  }

  async function setStatusOnly(id: string, status: string) {
    setSavingId(id);
    try {
      const r = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "فشل");
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل");
    } finally {
      setSavingId(null);
    }
  }

  if (loading && rows.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400">جاري التحميل…</p>;
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-sm">{err}</div>
      )}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        تُسجَّل الملاحظات من صفحة «ملاحظات للمطور» لكل المستخدمين المسجّلين. يمكنك تغيير الحالة أو كتابة رد يظهر لمرسل الملاحظة في نفس الصفحة.
      </p>
      <button
        type="button"
        onClick={() => void load()}
        className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
      >
        تحديث القائمة
      </button>

      {rows.length === 0 && !loading ? (
        <p className="text-gray-500 dark:text-gray-400">لا توجد ملاحظات بعد.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenId((x) => (x === row.id ? null : row.id));
                  setReplyDraft((d) => ({ ...d, [row.id]: row.admin_reply ?? d[row.id] ?? "" }));
                  setStatusDraft((d) => ({ ...d, [row.id]: row.status }));
                }}
                className="w-full text-right px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/80"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{row.title}</span>
                <span className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {TYPE_AR[row.type] ?? row.type}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded ${
                      row.status === "pending"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
                        : row.status === "resolved"
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {row.status === "pending" ? "معلّقة" : row.status === "resolved" ? "مُغلقة" : "مقروءة"}
                  </span>
                </span>
              </button>
              {openId === row.id && (
                <div className="px-4 pb-4 pt-0 border-t border-gray-100 dark:border-gray-800 space-y-3 text-sm">
                  <p className="text-gray-600 dark:text-gray-400">
                    <strong className="text-gray-800 dark:text-gray-200">{row.company_name}</strong>
                    {" — "}
                    {row.user_name} ({row.user_email})
                  </p>
                  <p className="text-gray-500 dark:text-gray-500 text-xs">{row.created_at}</p>
                  {row.page_path && (
                    <p className="text-xs text-sky-700 dark:text-sky-300">
                      الصفحة: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{row.page_path}</code>
                    </p>
                  )}
                  <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{row.message}</p>
                  {row.screenshot_url && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">لقطة الشاشة</p>
                      <a href={row.screenshot_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.screenshot_url}
                          alt=""
                          className="max-h-48 rounded-lg border border-gray-200 dark:border-gray-600"
                        />
                      </a>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void setStatusOnly(row.id, "read")}
                      className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600"
                    >
                      تعيين مقروءة
                    </button>
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void setStatusOnly(row.id, "resolved")}
                      className="text-xs px-2 py-1 rounded bg-emerald-600 text-white"
                    >
                      تعيين مُغلقة
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">رد يظهر للمستخدم</label>
                    <textarea
                      value={replyDraft[row.id] ?? row.admin_reply ?? ""}
                      onChange={(e) => setReplyDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                      rows={4}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
                      placeholder="اكتب ردك هنا… سيظهر في صفحة «ملاحظات للمطور» لدى المرسل."
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-gray-600 dark:text-gray-400">الحالة عند الحفظ:</label>
                    <select
                      value={statusDraft[row.id] ?? row.status}
                      onChange={(e) => setStatusDraft((d) => ({ ...d, [row.id]: e.target.value }))}
                      className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                    >
                      <option value="pending">معلّقة</option>
                      <option value="read">مقروءة</option>
                      <option value="resolved">مُغلقة</option>
                    </select>
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void saveRow(row.id)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {savingId === row.id ? "جاري الحفظ…" : "حفظ الرد والحالة"}
                    </button>
                  </div>
                  {row.admin_reply && row.admin_replied_at && (
                    <p className="text-xs text-gray-500">آخر رد محفوظ: {row.admin_replied_at}</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
