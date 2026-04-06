"use client";

import { useState, useEffect } from "react";
import { addToQueue } from "@/lib/offline-queue";

interface Treasury {
  id: string;
  name: string;
  type: string;
  balance: number;
  /** محافظ استلام (محفظة إلكترونية / إنستاباي — رقم المحول إليه) */
  is_payment_wallet?: boolean;
  payment_channel?: string;
  phone_digits?: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  item_name?: string | null;
  description: string | null;
  method_name: string | null;
  created_at: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
}

function SettleButton({ treasuries, onSuccess }: { treasuries: Treasury[]; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [note, setNote] = useState("");

  const core = treasuries.filter((t) => !t.is_payment_wallet);
  const sales = core.find((t) => t.type === "sales");
  const workshop = core.find((t) => t.type === "workshop");
  const main = core.find((t) => t.type === "main");
  const totalToSettle = (sales?.balance ?? 0) + (workshop?.balance ?? 0);

  if (!main || totalToSettle <= 0) return null;

  async function handleSettle() {
    if (!confirm(`تسليم ${totalToSettle.toFixed(2)} ج.م من خزينة المبيعات والورشة إلى الخزينة الرئيسية؟`)) return;

    const payload = {
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
      note: note.trim() || undefined,
    };

    setLoading(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "treasury_settle", data: payload });
        setModalOpen(false);
        setFromDate("");
        setToDate("");
        setNote("");
        alert("انقطع الاتصال. تم حفظ التسليم محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch("/api/admin/treasuries/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في التسليم");
        return;
      }
      setModalOpen(false);
      setFromDate("");
      setToDate("");
      setNote("");
      onSuccess();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "treasury_settle", data: payload });
        setModalOpen(false);
        setFromDate("");
        setToDate("");
        setNote("");
        alert("انقطع الاتصال. تم حفظ التسليم محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
      >
        تسليم إلى الخزينة الرئيسية
      </button>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">تسليم إلى الخزينة الرئيسية</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              المبلغ الإجمالي: <strong>{totalToSettle.toFixed(2)} ج.م</strong>
              <br />
              <span className="text-xs">(خزينة المبيعات: {sales?.balance?.toFixed(2)} + الورشة: {workshop?.balance?.toFixed(2)})</span>
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">من تاريخ</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">ملاحظة</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="تسليم نهاية اليوم"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSettle}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? "جاري..." : "تسليم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExpenseIncomeModal({
  type,
  treasuries,
  paymentMethods,
  onClose,
  onSuccess,
}: {
  type: "expense" | "income";
  treasuries: Treasury[];
  paymentMethods: PaymentMethod[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [treasuryId, setTreasuryId] = useState("");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (treasuries.length > 0 && !treasuryId) {
      const sales = treasuries.find((t) => t.type === "sales");
      const workshop = treasuries.find((t) => t.type === "workshop");
      setTreasuryId((sales?.id ?? workshop?.id ?? treasuries[0].id) || "");
    }
  }, [treasuries, treasuryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!treasuryId || amt <= 0) return;

    const payload = {
      type,
      treasury_id: treasuryId,
      amount: amt,
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      payment_method_id: paymentMethodId || undefined,
    };

    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "treasury_transaction", data: payload });
        onClose();
        setTreasuryId("");
        setAmount("");
        setDescription("");
        setPaymentMethodId("");
        alert("انقطع الاتصال. تم حفظ الحركة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
        return;
      }

      const res = await fetch("/api/admin/treasuries/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في الإضافة");
        return;
      }

      onClose();
      setTreasuryId("");
      setAmount("");
      setDescription("");
      setPaymentMethodId("");
      onSuccess();
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "treasury_transaction", data: payload });
        onClose();
        setTreasuryId("");
        setAmount("");
        setDescription("");
        setPaymentMethodId("");
        alert("انقطع الاتصال. تم حفظ الحركة محلياً. سيتم إرسالها تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          {type === "expense" ? "إضافة مصروف" : "إضافة إيراد"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>الخزينة *</label>
            <select
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              required
              className={inputClass}
            >
              {treasuries.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>المبلغ (ج.م) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className={inputClass}
              placeholder="0"
            />
          </div>
          <div>
            <label className={labelClass}>{type === "expense" ? "اسم المصروف" : "اسم الإيراد"}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder={type === "expense" ? "مثال: إيجار، كهرباء، مرتبات" : "مثال: بيع قطع، خدمة صيانة"}
            />
          </div>
          <div>
            <label className={labelClass}>تفاصيل إضافية (اختياري)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
              placeholder={type === "expense" ? "وصف أو ملاحظات" : "وصف أو ملاحظات"}
            />
          </div>
          <div>
            <label className={labelClass}>طريقة الدفع</label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>
                  {pm.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 px-4 py-2.5 font-medium rounded-lg transition-colors ${
                type === "expense"
                  ? "bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white"
              }`}
            >
              {saving ? "جاري..." : type === "expense" ? "إضافة مصروف" : "إضافة إيراد"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TreasuriesContent() {
  const [treasuries, setTreasuries] = useState<Treasury[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDesc, setTransferDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [expenseIncomeModal, setExpenseIncomeModal] = useState<"expense" | "income" | null>(null);
  /** تسليم: محفظة دفع أو خزينة مبيعات/ورشة */
  const [sweepingId, setSweepingId] = useState<string | null>(null);

  async function fetchTreasuries() {
    try {
      const res = await fetch("/api/admin/treasuries");
      if (res.ok) {
        const data = await res.json();
        setTreasuries(data);
        if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      }
    } catch {
      setTreasuries([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPaymentMethods() {
    try {
      const res = await fetch("/api/admin/payment-methods");
      if (res.ok) setPaymentMethods(await res.json());
    } catch {
      setPaymentMethods([]);
    }
  }

  async function fetchTransactions(id: string, list: Treasury[]) {
    try {
      const isWallet = list.some((t) => t.id === id && t.is_payment_wallet);
      const url = isWallet
        ? `/api/admin/treasuries/payment-wallets/${id}/transactions`
        : `/api/admin/treasuries/${id}/transactions`;
      const res = await fetch(url);
      if (res.ok) setTransactions(await res.json());
      else setTransactions([]);
    } catch {
      setTransactions([]);
    }
  }

  useEffect(() => {
    fetchTreasuries();
    fetchPaymentMethods();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      fetchTreasuries();
      fetchPaymentMethods();
      if (selectedId) fetchTransactions(selectedId, treasuries);
    };
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, [selectedId, treasuries]);

  useEffect(() => {
    if (selectedId) fetchTransactions(selectedId, treasuries);
  }, [selectedId, treasuries]);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferFrom || !transferTo || !transferAmount || Number(transferAmount) <= 0) return;

    const payload = {
      from_id: transferFrom,
      to_id: transferTo,
      amount: Number(transferAmount),
      description: transferDesc.trim() || undefined,
    };

    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "treasury_transfer", data: payload });
        setTransferOpen(false);
        setTransferFrom("");
        setTransferTo("");
        setTransferAmount("");
        setTransferDesc("");
        alert("انقطع الاتصال. تم حفظ التحويل محلياً. سيتم إرساله تلقائياً عند عودة الإنترنت.");
        return;
      }

      const res = await fetch("/api/admin/treasuries/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في التحويل");
        return;
      }

      setTransferOpen(false);
      setTransferFrom("");
      setTransferTo("");
      setTransferAmount("");
      setTransferDesc("");
      fetchTreasuries();
      if (selectedId) fetchTransactions(selectedId, treasuries);
    } catch {
      if (!navigator.onLine) {
        addToQueue({ type: "treasury_transfer", data: payload });
        setTransferOpen(false);
        setTransferFrom("");
        setTransferTo("");
        setTransferAmount("");
        setTransferDesc("");
        alert("انقطع الاتصال. تم حفظ التحويل محلياً. سيتم إرساله تلقائياً عند عودة الإنترنت.");
      } else {
        alert("حدث خطأ");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSweepPaymentWalletToMain(walletId: string, balance: number) {
    if (balance <= 0) return;
    if (!confirm(`تسليم ${balance.toFixed(2)} ج.م من هذه المحفظة إلى الخزينة الرئيسية (نقد)؟`)) return;
    setSweepingId(walletId);
    try {
      const res = await fetch(`/api/admin/treasuries/payment-wallets/${walletId}/sweep-to-main`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.error || "فشل التسليم");
        return;
      }
      await fetchTreasuries();
    } catch {
      alert("حدث خطأ");
    } finally {
      setSweepingId(null);
    }
  }

  async function handleSweepCoreTreasuryToMain(treasuryId: string, balance: number, type: string) {
    if (balance <= 0) return;
    const label = type === "sales" ? "خزينة المبيعات" : "خزينة الورشة";
    if (!confirm(`تسليم ${balance.toFixed(2)} ج.م من ${label} إلى الخزينة الرئيسية؟`)) return;
    setSweepingId(treasuryId);
    try {
      const res = await fetch(`/api/admin/treasuries/${treasuryId}/sweep-to-main`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.error || "فشل التسليم");
        return;
      }
      await fetchTreasuries();
    } catch {
      alert("حدث خطأ");
    } finally {
      setSweepingId(null);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-12 text-center">
        <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {treasuries.map((t) => (
          <div
            key={t.id}
            className={`bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border-2 transition-colors cursor-pointer ${
              selectedId === t.id
                ? "border-emerald-500"
                : "border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"
            }`}
            onClick={() => setSelectedId(t.id)}
          >
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{t.name}</h3>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{t.balance.toFixed(2)} ج.م</p>
            {t.is_payment_wallet && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSweepPaymentWalletToMain(t.id, t.balance);
                }}
                disabled={t.balance <= 0 || sweepingId !== null}
                className="mt-4 w-full px-3 py-2 text-sm font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sweepingId === t.id ? "جاري التسليم…" : "تسليم للخزينة الرئيسية"}
              </button>
            )}
            {!t.is_payment_wallet && (t.type === "sales" || t.type === "workshop") && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSweepCoreTreasuryToMain(t.id, t.balance, t.type);
                }}
                disabled={t.balance <= 0 || sweepingId !== null}
                className="mt-4 w-full px-3 py-2 text-sm font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sweepingId === t.id ? "جاري التسليم…" : "تسليم للخزينة الرئيسية"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setExpenseIncomeModal("expense")}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        >
          إضافة مصروف
        </button>
        <button
          onClick={() => setExpenseIncomeModal("income")}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
        >
          إضافة إيراد
        </button>
        <button
          onClick={() => {
            const core = treasuries.filter((t) => !t.is_payment_wallet);
            if (core.length >= 2) {
              setTransferFrom(core[0].id);
              setTransferTo(core[1].id);
              setTransferOpen(true);
            }
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
        >
          تحويل بين الخزائن
        </button>
        <SettleButton treasuries={treasuries.filter((t) => !t.is_payment_wallet)} onSuccess={fetchTreasuries} />
      </div>

      {expenseIncomeModal && (
        <ExpenseIncomeModal
          type={expenseIncomeModal}
          treasuries={treasuries.filter((t) => !t.is_payment_wallet)}
          paymentMethods={paymentMethods}
          onClose={() => setExpenseIncomeModal(null)}
          onSuccess={() => {
            fetchTreasuries();
            if (selectedId) fetchTransactions(selectedId, treasuries);
          }}
        />
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">
            حركة {treasuries.find((t) => t.id === selectedId)?.name ?? "الخزينة"}
          </h2>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">لا توجد حركات</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {transactions.map((tx) => (
                <li key={tx.id} className="p-4 flex justify-between items-center text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-300">
                      {tx.item_name ? `${tx.item_name}${tx.description ? ` — ${tx.description}` : ""}` : tx.description || tx.method_name || "—"}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 mr-2">
                      — {new Date(tx.created_at).toLocaleString("ar-EG")}
                    </span>
                  </div>
                  <span className={tx.amount >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                    {tx.amount >= 0 ? "+" : ""}{tx.amount.toFixed(2)} ج.م
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">تحويل بين الخزائن</h3>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">من</label>
                <select
                  value={transferFrom}
                  onChange={(e) => setTransferFrom(e.target.value)}
                  required
                  className={inputClass}
                >
                  {treasuries.filter((t) => !t.is_payment_wallet).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">إلى</label>
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  required
                  className={inputClass}
                >
                  {treasuries.filter((t) => !t.is_payment_wallet).map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظة</label>
                <input
                  type="text"
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  className={inputClass}
                  placeholder="تحويل بين الخزائن"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                >
                  {saving ? "جاري..." : "تحويل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
