"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { addToQueue } from "@/lib/offline-queue";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { TableSkeleton } from "@/components/ui/skeleton";
import { exportToExcel } from "@/lib/export-reports";
import { getErrorMessage } from "@/lib/error-messages";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export function CustomersContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  async function fetchCustomers(opts?: { page?: number }) {
    try {
      const p = opts?.page ?? page;
      const limit = 50;
      const offset = (p - 1) * limit;
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/admin/customers?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCustomers(data);
          setTotalCustomers(data.length);
        } else {
          setCustomers(data.customers ?? []);
          setTotalCustomers(data.total ?? 0);
        }
      } else {
        setCustomers([]);
        setTotalCustomers(0);
      }
    } catch {
      setCustomers([]);
      setTotalCustomers(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    fetchCustomers({ page });
  }, [page, searchQuery]);

  useEffect(() => {
    const handleOnline = () => fetchCustomers();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, []);

  function resetForm() {
    setForm({ name: "", phone: "", email: "", address: "", notes: "" });
    setEditCustomer(null);
  }

  function openEditModal(c: Customer) {
    setEditCustomer(c);
    setForm({
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      notes: c.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    setSaving(true);
    try {
      if (editCustomer) {
        if (!navigator.onLine) {
          addToQueue({
            type: "edit_customer",
            customerId: editCustomer.id,
            data: {
              name: payload.name,
              phone: payload.phone ?? null,
              email: payload.email ?? null,
              address: payload.address ?? null,
              notes: payload.notes ?? null,
            },
          });
          setModalOpen(false);
          resetForm();
          alert("انقطع الاتصال. تم حفظ التعديل محلياً. سيتم إرساله تلقائياً عند عودة الإنترنت.");
          return;
        }
        const res = await fetch(`/api/admin/customers/${editCustomer.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || "فشل في التحديث");
          return;
        }
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === editCustomer.id
              ? {
                  ...c,
                  name: payload.name,
                  phone: payload.phone ?? null,
                  email: payload.email ?? null,
                  address: payload.address ?? null,
                  notes: payload.notes ?? null,
                }
              : c
          )
        );
      } else {
        if (!navigator.onLine) {
          addToQueue({ type: "add_customer", data: payload });
          setModalOpen(false);
          resetForm();
          alert("انقطع الاتصال. تم حفظ العميل محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
          return;
        }
        const res = await fetch("/api/admin/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || "فشل في الحفظ");
          return;
        }
        await res.json();
        fetchCustomers({ page: 1 });
      }

      setModalOpen(false);
      resetForm();
    } catch (err) {
      if (editCustomer && !navigator.onLine) {
        addToQueue({
          type: "edit_customer",
          customerId: editCustomer.id,
          data: {
            name: payload.name,
            phone: payload.phone ?? null,
            email: payload.email ?? null,
            address: payload.address ?? null,
            notes: payload.notes ?? null,
          },
        });
        setModalOpen(false);
        resetForm();
        alert("انقطع الاتصال. تم حفظ التعديل محلياً. سيتم إرساله تلقائياً عند عودة الإنترنت.");
      } else if (!editCustomer && !navigator.onLine) {
        addToQueue({ type: "add_customer", data: payload });
        setModalOpen(false);
        resetForm();
        alert("انقطع الاتصال. تم حفظ العميل محلياً. سيتم إضافته تلقائياً عند عودة الإنترنت.");
      } else {
        alert(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Customer) {
    setSaving(true);
    try {
      if (!navigator.onLine) {
        addToQueue({ type: "delete_customer", customerId: c.id });
        setCustomers((prev) => prev.filter((x) => x.id !== c.id));
        setTotalCustomers((t) => Math.max(0, t - 1));
        setDeleteConfirm(null);
        alert("انقطع الاتصال. تم حفظ الحذف محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
        return;
      }
      const res = await fetch(`/api/admin/customers/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "فشل في الحذف");
        return;
      }
      const data = await res.json();
      fetchCustomers({ page });
      setDeleteConfirm(null);
      if (data?.message) alert(data.message);
    } catch (err) {
      if (!navigator.onLine) {
        addToQueue({ type: "delete_customer", customerId: c.id });
        setCustomers((prev) => prev.filter((x) => x.id !== c.id));
        setTotalCustomers((t) => Math.max(0, t - 1));
        setDeleteConfirm(null);
        alert("انقطع الاتصال. تم حفظ الحذف محلياً. سيتم تنفيذه تلقائياً عند عودة الإنترنت.");
      } else {
        alert(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const ROWS_PER_PAGE = 50;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / ROWS_PER_PAGE));

  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPage(totalPages);
  }, [customers.length, page, totalPages]);

  const customerFormRef = useRef<HTMLFormElement>(null);
  useKeyboardShortcut({
    onSave: () => modalOpen && !saving && customerFormRef.current?.requestSubmit(),
    onEscape: () => modalOpen && (setModalOpen(false), resetForm()),
    enabled: modalOpen,
  });

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="h-6 w-36 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
        </div>
        <TableSkeleton rows={8} cols={4} />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-2 justify-between items-center">
          <h2 className="font-medium text-gray-900 dark:text-gray-100">قائمة العملاء</h2>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، الهاتف، البريد..."
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm w-48 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/admin/customers");
                const all = res.ok ? await res.json() : [];
                const list = Array.isArray(all) ? all : (all.customers ?? []);
                const data = list.map((c: Customer) => ({
                  الاسم: c.name,
                  الهاتف: c.phone || "—",
                  البريد: c.email || "—",
                  العنوان: c.address || "—",
                  الملاحظات: c.notes || "—",
                }));
                exportToExcel(data, `عملاء-${new Date().toISOString().slice(0, 10)}`, "العملاء");
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              تصدير Excel
            </button>
            <button
              onClick={() => {
                resetForm();
                setModalOpen(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              إضافة عميل جديد
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-600">
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الاسم</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الهاتف</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">البريد</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    لا يوجد عملاء. اضغط «إضافة عميل جديد» للبدء.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.email || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className="px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(c)}
                          className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 text-gray-700 dark:text-gray-300"
              >
                السابق
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                صفحة {page} من {totalPages} — {totalCustomers} عميل
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 text-gray-700 dark:text-gray-300"
              >
                التالي
              </button>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editCustomer ? "تعديل عميل" : "إضافة عميل جديد"}
              </h3>
            </div>

            <form ref={customerFormRef} onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الاسم *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className={inputClass}
                  placeholder="اسم العميل"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الهاتف</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className={inputClass}
                  placeholder="01xxxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className={inputClass}
                  placeholder="العنوان"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className={inputClass}
                  rows={3}
                  placeholder="ملاحظات إضافية"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
                >
                  {saving ? "جاري الحفظ..." : editCustomer ? "تحديث" : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" dir="rtl">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">تأكيد الحذف</h3>
            <p className="text-gray-600 mb-6">
              هل أنت متأكد من حذف العميل &quot;{deleteConfirm.name}&quot;؟
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors"
              >
                {saving ? "جاري الحذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
