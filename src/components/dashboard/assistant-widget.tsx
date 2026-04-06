"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASSISTANT_COMPANY_COST_EGP, ASSISTANT_OBD_GLOBAL_COST_EGP } from "@/lib/assistant-pricing";

type AssistantMode = "company" | "obd_global";

type ChatMsg = { role: "user" | "assistant"; text: string };

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("company");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const cost = mode === "obd_global" ? ASSISTANT_OBD_GLOBAL_COST_EGP : ASSISTANT_COMPANY_COST_EGP;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = useCallback(
    async (confirmCharge: boolean) => {
      const text = input.trim();
      if (!text || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, mode, confirm_charge: confirmCharge }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "فشل الطلب");
          return;
        }
        if (data.needs_confirmation) {
          setMsgs((m) => [...m, { role: "user", text }]);
          setPending(true);
          return;
        }
        setPending(false);
        if (confirmCharge) {
          setMsgs((m) => [...m, { role: "assistant", text: String(data.reply ?? "") }]);
        } else {
          setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: String(data.reply ?? "") }]);
        }
        setInput("");
      } catch {
        setError("تعذر الاتصال بالخادم");
      } finally {
        setLoading(false);
      }
    },
    [input, mode, loading]
  );

  const handleSendClick = () => {
    if (pending) return;
    void send(false);
  };

  const handleConfirmCharge = () => {
    void send(true);
  };

  const handleCancelPending = () => {
    setPending(false);
    setMsgs((m) => {
      if (m.length === 0) return m;
      const last = m[m.length - 1];
      if (last.role === "user") return m.slice(0, -1);
      return m;
    });
  };

  return (
    <div className="no-print fixed bottom-4 left-4 z-[60] flex flex-col items-start gap-2" dir="rtl">
      {open && (
        <div className="w-[min(100vw-2rem,22rem)] max-h-[min(70vh,420px)] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 text-sm">
            <div className="font-semibold text-gray-900 dark:text-gray-100">مساعد EFCT</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("company");
                  setPending(false);
                }}
                className={`rounded-lg px-2 py-1 text-xs ${
                  mode === "company"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
              >
                بيانات الشركة ({ASSISTANT_COMPANY_COST_EGP} ج.م)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("obd_global");
                  setPending(false);
                }}
                className={`rounded-lg px-2 py-1 text-xs ${
                  mode === "obd_global"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
              >
                أكواد السيارات ({ASSISTANT_OBD_GLOBAL_COST_EGP} ج.م)
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
              {mode === "company"
                ? "إجابات من بيانات شركتك (كشف حساب عميل/مورد، تفاصيل صنف، مخزون، عملاء، موردون، تقارير) حسب صلاحياتك. يُخصم المبلغ بعد التأكيد."
                : "استعلام من قاعدة أكواد البرنامج العامة (مثل P0300). اكتب الكود بوضوح. يُخصم 1 ج.م بعد التأكيد."}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm min-h-[120px]">
            {msgs.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-xs">
                جرّب: «كشف حساب عميل …»، «حساب مورد …»، «تفاصيل صنف …»، «مخزون …»، «عميل …»، «تقرير»، أو «P0300» في وضع الأكواد.
              </p>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-2 py-1.5 whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-blue-50 dark:bg-blue-950/40 mr-0 ml-8"
                    : "bg-gray-100 dark:bg-gray-800 ml-0 mr-0"
                }`}
              >
                {m.text}
              </div>
            ))}
            {pending && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs">
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  تأكيد الخصم: {cost} ج.م من محفظة الشركة
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmCharge}
                    disabled={loading}
                    className="rounded-md bg-amber-600 px-3 py-1 text-white text-xs disabled:opacity-50"
                  >
                    {loading ? "…" : "تأكيد وإرسال"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelPending}
                    disabled={loading}
                    className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
            {error && <p className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
            <div ref={bottomRef} />
          </div>
          <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendClick();
                }
              }}
              placeholder={mode === "obd_global" ? "مثال: P0300" : "اكتب سؤالك…"}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm"
              disabled={loading || pending}
            />
            <button
              type="button"
              onClick={handleSendClick}
              disabled={loading || pending || !input.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-white text-sm disabled:opacity-50"
            >
              {loading ? "…" : "إرسال"}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full w-14 h-14 shadow-lg bg-blue-600 text-white text-2xl flex items-center justify-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label={open ? "إغلاق المساعد" : "فتح المساعد"}
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
