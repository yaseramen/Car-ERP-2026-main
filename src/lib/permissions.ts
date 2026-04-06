import { db } from "@/lib/db/client";

export type PermissionAction = "read" | "create" | "update" | "delete";

const ACTION_TO_COLUMN: Record<PermissionAction, string> = {
  read: "can_read",
  create: "can_create",
  update: "can_update",
  delete: "can_delete",
};

/** تحقق من صلاحية المستخدم - super_admin و tenant_owner لديهم صلاحيات كاملة */
export async function canAccess(
  userId: string,
  role: string,
  companyId: string | null,
  screenModule: string,
  action: PermissionAction
): Promise<boolean> {
  if (role === "super_admin") return true;
  if (role === "tenant_owner" && companyId) return true;

  if (role !== "employee" || !companyId) return false;

  const col = ACTION_TO_COLUMN[action];
  const result = await db.execute({
    sql: `SELECT up.can_read, up.can_create, up.can_update, up.can_delete
          FROM user_permissions up
          JOIN screens s ON s.id = up.screen_id
          WHERE up.user_id = ? AND s.module = ?`,
    args: [userId, screenModule],
  });

  const row = result.rows[0];
  if (!row) return false;
  const val = (row as Record<string, unknown>)[col];
  return Number(val ?? 0) === 1;
}

/** جلب صلاحيات موظف لجميع الشاشات */
export async function getUserPermissions(userId: string): Promise<Record<string, { read: boolean; create: boolean; update: boolean; delete: boolean }>> {
  const result = await db.execute({
    sql: `SELECT s.module, up.can_read, up.can_create, up.can_update, up.can_delete
          FROM user_permissions up
          JOIN screens s ON s.id = up.screen_id
          WHERE up.user_id = ?`,
    args: [userId],
  });

  const perms: Record<string, { read: boolean; create: boolean; update: boolean; delete: boolean }> = {};
  for (const row of result.rows) {
    const m = String(row.module ?? "");
    perms[m] = {
      read: Number(row.can_read ?? 0) === 1,
      create: Number(row.can_create ?? 0) === 1,
      update: Number(row.can_update ?? 0) === 1,
      delete: Number(row.can_delete ?? 0) === 1,
    };
  }
  return perms;
}

/** أول مسار مسموح للموظف (للتوجيه عند عدم وجود صلاحية الرئيسية) */
const MODULE_ROUTES: Record<string, string> = {
  inventory: "/admin/inventory",
  workshop: "/admin/workshop",
  obd: "/admin/obd",
  cashier: "/admin/cashier",
  purchases: "/admin/purchases",
  invoices: "/admin/invoices",
  customers: "/admin/customers",
  suppliers: "/admin/suppliers",
  reports: "/admin/reports",
  treasuries: "/admin/treasuries",
};

export async function getFirstAllowedRoute(userId: string): Promise<string | null> {
  const perms = await getUserPermissions(userId);
  for (const [module, p] of Object.entries(perms)) {
    if (p.read && MODULE_ROUTES[module]) return MODULE_ROUTES[module];
  }
  return null;
}
