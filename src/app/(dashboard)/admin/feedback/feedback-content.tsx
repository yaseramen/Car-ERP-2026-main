"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { addToQueue } from "@/lib/offline-queue";
import { FEEDBACK_USER_UNREAD_BASELINE_KEY } from "@/lib/feedback-notification-keys";

type MyItem = {
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
};

const TYPE_AR: Record<string, string> = {
  bug: "خطأ",
  feature: "اقتراح",
  feedback: "ملاحظة",
};

const STATUS_AR: Record<string, string> = {
  pending: "قيد المراجعة",
  read: "تمت المطالعة",
  resolved: "مُغلقة",
};

export function FeedbackContent() {
  const pathname = usePathname();
  const [type, setType] = useState<string>("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotFileName, setScreenshotFileName] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [myItems, setMyItems] = useState<MyItem[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadMine() {
    setMyLoading(true);
    try {
      const r = await fetch("/api/feedback/my");
      const d = await r.json();
      if (r.ok && Array.isArray(d.items)) setMyItems(d.items);
    } catch {
      /* ignore */
    } finally {
      setMyLoading(false);
    }
  }

  useEffect(() => {
    void loadMine();
  }, []);

  /** عند فتح الصفحة: اعتبار ردود الإدارة مُطالَعة حتى لا يتكرر إشعار المتصفح */
  useEffect(() => {
    void (async () => {
      try {
        await fetch("/api/feedback/mark-replies-seen", { method: "POST" });
        const r = await fetch("/api/feedback/notify-summary");
        const d = await r.json();
        if (r.ok && typeof d.unreadReplyCount === "number") {
          try {
            localStorage.setItem(FEEDBACK_USER_UNREAD_BASELINE_KEY, String(d.unreadReplyCount));
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  async function onPickScreenshot(file: File | null) {
    if (!file) return;
    setUploadingShot(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/feedback/screenshot", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "فشل رفع اللقطة");
        return;
      }
      setScreenshotUrl(data.url);
      setScreenshotFileName(file.name);
    } catch {
      alert("فشل رفع اللقطة");
    } finally {
      setUploadingShot(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    const payload = {
      type,
      subject: subject.trim(),
      message: message.trim(),
      screenshot_url: screenshotUrl,
      page_path: pathname || null,
    };
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "submit_feedback", data: payload });
        setSent(true);
        setSubject("");
        setMessage("");
        setScreenshotUrl(null);
        setScreenshotFileName(null);
        alert("انقطع الاتصال. تم حفظ الملاحظة. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSent(true);
        setSubject("");
        setMessage("");
        setScreenshotUrl(null);
        setScreenshotFileName(null);
        void loadMine();
      } else {
        const err = await res.json();
        alert(err.error || "فشل في الإرسال");
      }
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "submit_feedback", data: payload });
        setSent(true);
        setSubject("");
        setMessage("");
        setScreenshotUrl(null);
        setScreenshotFileName(null);
        alert("انقطع الاتصال. تم حفظ الملاحظة. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ. حاول مرة أخرى.");
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center border border-gray-100 dark:border-gray-700">
        <p className="text-emerald-600 dark:text-emerald-400 font-medium mb-2">تم إرسال ملاحظتك بنجاح</p>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
          تصل إلى <strong>صندوق ملاحظات المطور</strong> لدى Super Admin (من القائمة: صندوق ملاحظات المطور).
        </p>
        <p className="text-gray-500 dark:text-gray-500 text-xs mb-4">
          يمكنك متابعة رد الإدارة أدناه في «ملاحظاتي السابقة» بعد تحديث الصفحة.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          إرسال ملاحظة أخرى
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 p-3 text-sm text-sky-900 dark:text-sky-200">
            <strong>أين تذهب الملاحظة؟</strong> تُحفَظ في النظام ويستعرضها Super Admin من القائمة:{" "}
            <strong>صندوق ملاحظات المطور</strong>. يمكنه تغيير الحالة وكتابة رد يظهر لك هنا في «ملاحظاتي السابقة».
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">نوع الملاحظة</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="suggestion">اقتراح تطوير</option>
              <option value="bug">الإبلاغ عن خطأ</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الموضوع *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              placeholder="موضوع الملاحظة"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الملاحظة *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={5}
              placeholder="اكتب ملاحظتك أو وصف الخطأ…"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              لقطة شاشة (اختياري)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              التقط لقطة من الشاشة (مفتاح الطباعة أو أداة النظام)، ثم اختر الملف هنا. يُرفق مع الملاحظة ويُسجَّل
              تلقائياً مسار الصفحة الحالية:{" "}
              <code className="text-[11px] bg-gray-100 dark:bg-gray-900 px-1 rounded">{pathname || "—"}</code>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void onPickScreenshot(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploadingShot}
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {uploadingShot ? "جاري الرفع…" : screenshotUrl ? "تغيير اللقطة" : "إرفاق لقطة شاشة"}
              </button>
              {screenshotUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setScreenshotUrl(null);
                    setScreenshotFileName(null);
                  }}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  إزالة
                </button>
              )}
              {screenshotFileName && <span className="text-xs text-gray-500 truncate max-w-[200px]">{screenshotFileName}</span>}
            </div>
            {screenshotUrl && (
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotUrl} alt="" className="max-h-32 rounded border border-gray-200 dark:border-gray-600" />
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={sending}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
          >
            {sending ? "جاري الإرسال..." : "إرسال"}
          </button>
        </form>
      </div>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">ملاحظاتي السابقة ورد الإدارة</h2>
          <button
            type="button"
            onClick={() => void loadMine()}
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            تحديث
          </button>
        </div>
        {myLoading ? (
          <p className="text-sm text-gray-500">جاري التحميل…</p>
        ) : myItems.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">لا توجد ملاحظات مرسلة بعد.</p>
        ) : (
          <ul className="space-y-3">
            {myItems.map((it) => (
              <li
                key={it.id}
                className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 text-sm"
              >
                <div className="flex flex-wrap gap-2 items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{it.title}</span>
                  <span className="text-xs text-gray-500">
                    {TYPE_AR[it.type] ?? it.type} · {STATUS_AR[it.status] ?? it.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{it.created_at}</p>
                {it.page_path && (
                  <p className="text-xs text-gray-500 mb-1">
                    الصفحة: <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded">{it.page_path}</code>
                  </p>
                )}
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-2">{it.message}</p>
                {it.screenshot_url && (
                  <a href={it.screenshot_url} target="_blank" rel="noopener noreferrer" className="inline-block mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.screenshot_url}
                      alt=""
                      className="max-h-24 rounded border border-gray-200 dark:border-gray-600"
                    />
                  </a>
                )}
                {it.admin_reply ? (
                  <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 rounded p-2">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-1">رد الإدارة</p>
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{it.admin_reply}</p>
                    {it.admin_replied_at && (
                      <p className="text-[11px] text-gray-500 mt-1">{it.admin_replied_at}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">لم يُرد بعد — سيظهر هنا عند الرد.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
