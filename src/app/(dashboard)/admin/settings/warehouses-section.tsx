"use client";

import { useState, useEffect } from "react";
import { getErrorMessage } from "@/lib/error-messages";
import { addToQueue } from "@/lib/offline-queue";

interface Warehouse {
  id: string;
  name: string;
  type: string;
  location: string | null;
  is_active: boolean;
}

export function WarehousesSection() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({ name: "", type: "main" as "main" | "distribution", location: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<Warehouse | null>(null);

  async function fetchWarehouses() {
    try {
      const res = await fetch("/api/admin/warehouses?all=1");
      if (res.ok) {
        const data = await res.json();
        setWarehouses(Array.isArray(data) ? data : []);
      }
    } catch {
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWarehouses();
  }, []);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", type: "distribution", location: "" });
    setModalOpen(true);
  }

  function openEdit(w: Warehouse) {
    setEditing(w);
    setForm({ name: w.name, type: w.type as "main" | "distribution", location: w.location || "" });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      if (editing) {
        const payload = {
          name: form.name.trim(),
          type: form.type,
          location: form.location.trim() || null,
        };
        if (!navigator.onLine) {
          addToQueue({ type: "warehouse_patch", warehouseId: editing.id, data: payload });
          setMessage({ type: "success", text: "انقطع الاتصال. تم حفظ التعديل. سيتم إرساله عند العودة." });
          setModalOpen(false);
          fetchWarehouses();
          return;
        }
        const res = await fetch(`/api/admin/warehouses/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ type: "error", text: data.error || "فشل التحديث" });
          return;
        }
        setMessage({ type: "success", text: "تم التحديث بنجاح" });
      } else {
        const res = await fetch("/api/admin/warehouses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            type: form.type,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessage({ type: "error", text: data.error || "فشل الإضافة" });
          return;
        }
        setMessage({ type: "success", text: "تمت الإضافة بنجاح" });
      }
      setModalOpen(false);
      fetchWarehouses();
    } catch (err) {
      if (editing && !navigator.onLine) {
        addToQueue({
          type: "warehouse_patch",
          warehouseId: editing.id,
          data: {
            name: form.name.trim(),
            type: form.type,
            location: form.location.trim() || null,
          },
        });
        setMessage({ type: "success", text: "انقطع الاتصال. تم حفظ التعديل. سيتم إرساله عند العودة." });
        setModalOpen(false);
        fetchWarehouses();
      } else {
        setMessage({ type: "error", text: getErrorMessage(err, "حدث خطأ") });
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const handleOnline = () => fetchWarehouses();
    window.addEventListener("alameen-online", handleOnline);
    return () => window.removeEventListener("alameen-online", handleOnline);
  }, []);

  async function handleDelete(w: Warehouse) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/warehouses/${w.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "فشل الحذف" });
        return;
      }
      setMessage({ type: "success", text: "تم تعطيل المخزن" });
      setDeleteConfirm(null);
      fetchWarehouses();
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err, "حدث خطأ") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-gray-500 dark:text-gray-400">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200"
              : "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-gray-600 dark:text-gray-400">إضافة وتعديل وتعطيل المخازن. النقل بين المخازن من صفحة المخزن.</p>
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg"
        >
          إضافة مخزن
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الاسم</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">النوع</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الموقع</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الحالة</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id} className="border-b border-gray-100 dark:border-gray-700">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{w.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {w.type === "main" ? "رئيسي" : "توزيع"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{w.location || "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                      w.is_active ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200" : "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {w.is_active ? "نشط" : "معطّل"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => openEdit(w)}
                      className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      تعديل
                    </button>
                    {!w.is_active && (
                      <button
                        type="button"
                        onClick={async () => {
                          setSaving(true);
                          setMessage(null);
                          try {
                            const res = await fetch(`/api/admin/warehouses/${w.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ is_active: true }),
                            });
                            const data = await res.json();
                            if (!res.ok) {
                              setMessage({ type: "error", text: data.error || "فشل التفعيل" });
                            } else {
                              setMessage({ type: "success", text: "تم التفعيل" });
                              fetchWarehouses();
                            }
                          } catch (err) {
                            setMessage({ type: "error", text: getErrorMessage(err, "حدث خطأ") });
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        تفعيل
                      </button>
                    )}
                    {w.is_active && warehouses.filter((x) => x.is_active).length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(w)}
                        className="text-sm text-red-600 dark:text-red-400 hover:underline"
                      >
                        تعطيل
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {warehouses.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">لا توجد مخازن. أضف مخزناً للبدء.</div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editing ? "تعديل المخزن" : "إضافة مخزن"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الاسم</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">النوع</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "main" | "distribution" }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="main">رئيسي</option>
                  <option value="distribution">توزيع</option>
                </select>
              </div>
              {editing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الموقع (اختياري)</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? "جاري الحفظ…" : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">تعطيل المخزن</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              هل تريد تعطيل مخزن «{deleteConfirm.name}»؟ يجب أن يكون المخزن فارغاً (بدون كميات).
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={saving}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? "..." : "تعطيل"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
