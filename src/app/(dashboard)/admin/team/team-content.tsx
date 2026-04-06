"use client";

import { useState, useEffect } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  is_blocked: boolean;
  created_at?: string;
  assigned_warehouse_id?: string | null;
  assigned_warehouse_name?: string | null;
};

type ScreenPerm = {
  screen_id: string;
  module: string;
  name_ar: string;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "مدير النظام",
  tenant_owner: "صاحب المركز",
  employee: "موظف",
};

export function TeamContent({ canDeleteEmployee = false }: { canDeleteEmployee?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [screens, setScreens] = useState<{ id: string; name_ar: string; module: string }[]>([]);
  const [perms, setPerms] = useState<ScreenPerm[]>([]);

  const [form, setForm] = useState({
    email: "",
    password: "",
    newPassword: "",
    confirmPassword: "",
    name: "",
    phone: "",
    role: "employee",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [distWarehouses, setDistWarehouses] = useState<{ id: string; name: string; assigned_user_id: string | null }[]>([]);
  const [assignedWarehouseId, setAssignedWarehouseId] = useState("");

  const loadUsers = () => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => (Array.isArray(data) ? setUsers(data) : setUsers([])))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (showForm && editingUser?.role === "employee") {
      fetch("/api/admin/warehouses/distribution-list")
        .then((r) => r.json())
        .then((d) => setDistWarehouses(Array.isArray(d.warehouses) ? d.warehouses : []))
        .catch(() => setDistWarehouses([]));
    } else {
      setDistWarehouses([]);
    }
  }, [showForm, editingUser?.id, editingUser?.role]);

  useEffect(() => {
    if (permUser) {
      fetch("/api/admin/screens")
        .then((r) => r.json())
        .then(setScreens)
        .catch(() => setScreens([]));
      fetch(`/api/admin/users/${permUser.id}/permissions`)
        .then((r) => r.json())
        .then((data) => (Array.isArray(data) ? setPerms(data) : setPerms([])))
        .catch(() => setPerms([]));
    } else {
      setPerms([]);
      setScreens([]);
    }
  }, [permUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const url = editingUser ? `/api/admin/users/${editingUser.id}` : "/api/admin/users";
      const method = editingUser ? "PATCH" : "POST";
      let body: Record<string, unknown>;
      if (editingUser) {
        body = { name: form.name, phone: form.phone || null };
        if (editingUser.role === "employee") {
          body.assigned_warehouse_id = assignedWarehouseId.trim() || null;
        }
        if (form.newPassword.trim()) {
          if (form.newPassword !== form.confirmPassword) {
            setError("تأكيد كلمة المرور لا يطابق الجديدة");
            setSubmitting(false);
            return;
          }
          if (form.newPassword.length < 6) {
            setError("كلمة المرور الجديدة 6 أحرف على الأقل");
            setSubmitting(false);
            return;
          }
          body.password = form.newPassword;
        }
      } else {
        body = { email: form.email, password: form.password, name: form.name, phone: form.phone || null, role: form.role };
      }

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        return;
      }
      setShowForm(false);
      setEditingUser(null);
      setForm({ email: "", password: "", newPassword: "", confirmPassword: "", name: "", phone: "", role: "employee" });
      loadUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePermanent = async (u: User) => {
    if (!canDeleteEmployee || u.role !== "employee") return;
    if (
      !confirm(
        `حذف المستخدم "${u.name}" نهائياً؟ لا يمكن التراجع. تأكد أنه لم يعد يحتاج للدخول.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      loadUsers();
    } else {
      alert((data as { error?: string }).error || "فشل الحذف");
    }
  };

  const handleBlock = async (u: User) => {
    if (!confirm(`هل تريد ${u.is_blocked ? "إلغاء حظر" : "حظر"} ${u.name}؟`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_blocked: !u.is_blocked }),
    });
    if (res.ok) loadUsers();
  };

  const handleSavePerms = async () => {
    if (!permUser) return;
    const permissions = perms
      .filter((p) => p.can_read || p.can_create || p.can_update || p.can_delete)
      .map((p) => ({
        screen_id: p.screen_id,
        can_read: p.can_read ? 1 : 0,
        can_create: p.can_create ? 1 : 0,
        can_update: p.can_update ? 1 : 0,
        can_delete: p.can_delete ? 1 : 0,
      }));

    const res = await fetch(`/api/admin/users/${permUser.id}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });
    if (res.ok) {
      setPermUser(null);
    }
  };

  const togglePerm = (idx: number, key: "can_read" | "can_create" | "can_update" | "can_delete") => {
    setPerms((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: !next[idx][key] };
      return next;
    });
  };

  if (loading) {
    return <p className="text-gray-500">جاري التحميل...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">قائمة المستخدمين</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingUser(null);
            setAssignedWarehouseId("");
            setForm({ email: "", password: "", newPassword: "", confirmPassword: "", name: "", phone: "", role: "employee" });
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
        >
          + إضافة مستخدم
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-4">{editingUser ? "تعديل المستخدم" : "مستخدم جديد"}</h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            {!editingUser && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور</label>
                  <input
                    type="password"
                    required={!editingUser}
                    minLength={6}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الدور</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="employee">موظف</option>
                    <option value="tenant_owner">صاحب مركز</option>
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الهاتف</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            {editingUser && editingUser.role === "employee" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">مخزن توزيع / سيارة (موزّع)</label>
                <select
                  value={assignedWarehouseId}
                  onChange={(e) => setAssignedWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">— بدون (وصول عادي للمخزن الرئيسي) —</option>
                  {distWarehouses.map((w) => (
                    <option
                      key={w.id}
                      value={w.id}
                      disabled={!!w.assigned_user_id && w.assigned_user_id !== editingUser.id}
                    >
                      {w.name}
                      {w.assigned_user_id && w.assigned_user_id !== editingUser.id ? " (مسند لمستخدم آخر)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  عند الإسناد يرى الموظف مخزونه فقط، ويبيع منه، ويجمع النقد في خزينته اليومية حتى التسليم للخزينة الرئيسية.
                </p>
              </div>
            )}
            {editingUser && (
              <>
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-3">تغيير كلمة مرور الموظف (اختياري — اتركه فارغاً للإبقاء على الحالية)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">كلمة المرور الجديدة</label>
                      <input
                        type="password"
                        minLength={6}
                        autoComplete="new-password"
                        value={form.newPassword}
                        onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="اتركه فارغاً إذا لم ترد التغيير"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">تأكيد كلمة المرور</label>
                      <input
                        type="password"
                        minLength={6}
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {editingUser ? "حفظ" : "إضافة"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-sm font-medium text-gray-700">الاسم</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-700">البريد</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-700">الدور</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-700">التوزيع</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-700">الحالة</th>
              <th className="px-4 py-3 text-sm font-medium text-gray-700">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">{ROLE_LABELS[u.role] || u.role}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {u.role === "employee" && u.assigned_warehouse_name ? (
                    <span title={u.assigned_warehouse_id ?? ""}>{u.assigned_warehouse_name}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.is_blocked ? (
                    <span className="text-red-600 font-medium">محظور</span>
                  ) : (
                    <span className="text-emerald-600">نشط</span>
                  )}
                </td>
                <td className="px-4 py-3 flex gap-2">
                  {u.role === "employee" && (
                    <button
                      onClick={() => setPermUser(u)}
                      className="text-sm text-emerald-600 hover:underline"
                    >
                      صلاحيات
                    </button>
                  )}
                  {u.role === "employee" && (
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setAssignedWarehouseId(u.assigned_warehouse_id || "");
                        setForm({
                          email: u.email,
                          password: "",
                          newPassword: "",
                          confirmPassword: "",
                          name: u.name,
                          phone: u.phone || "",
                          role: u.role,
                        });
                        setShowForm(true);
                      }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      تعديل
                    </button>
                  )}
                  {u.role === "employee" && (
                    <button onClick={() => handleBlock(u)} className="text-sm text-amber-600 hover:underline">
                      {u.is_blocked ? "إلغاء الحظر" : "حظر"}
                    </button>
                  )}
                  {canDeleteEmployee && u.role === "employee" && (
                    <button
                      type="button"
                      onClick={() => handleDeletePermanent(u)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      حذف نهائي
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {permUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto p-6">
            <h3 className="font-bold text-gray-900 mb-4">صلاحيات: {permUser.name}</h3>
            <p className="text-sm text-gray-500 mb-4">حدد الصلاحيات لكل شاشة (قراءة، إضافة، تعديل، حذف)</p>
            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {perms.map((p, idx) => (
                <div
                  key={p.screen_id}
                  className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50"
                >
                  <span className="font-medium text-gray-900 min-w-[140px] shrink-0">
                    {p.name_ar || p.module || "—"}
                  </span>
                  <div className="flex items-center gap-6 shrink-0">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.can_read}
                        onChange={() => togglePerm(idx, "can_read")}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">قراءة</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.can_create}
                        onChange={() => togglePerm(idx, "can_create")}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">إضافة</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.can_update}
                        onChange={() => togglePerm(idx, "can_update")}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">تعديل</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.can_delete}
                        onChange={() => togglePerm(idx, "can_delete")}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">حذف</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            {perms.length === 0 && (
              <p className="text-gray-500 text-sm py-4">جاري تحميل القائمة...</p>
            )}
            <div className="mt-6 flex gap-2">
              <button onClick={handleSavePerms} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                حفظ الصلاحيات
              </button>
              <button onClick={() => setPermUser(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
