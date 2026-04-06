import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { ensureCompanyWarehouse } from "@/lib/warehouse";

export type DistributionContext = {
  assignedWarehouseId: string;
  warehouseName: string;
  warehouseType: string;
  distributionTreasuryId: string;
  treasuryBalance: number;
};

/**
 * موظف له مخزن توزيع مسند: مخزن من نوع distribution + صف في distribution_treasuries
 */
export async function getDistributionContext(
  userId: string,
  companyId: string
): Promise<DistributionContext | null> {
  const u = await db.execute({
    sql: `SELECT u.assigned_warehouse_id, w.name, w.type
          FROM users u
          JOIN warehouses w ON w.id = u.assigned_warehouse_id
          WHERE u.id = ? AND u.company_id = ? AND w.company_id = ? AND w.type = 'distribution' AND w.is_active = 1`,
    args: [userId, companyId, companyId],
  });
  if (u.rows.length === 0) return null;

  const whId = String(u.rows[0].assigned_warehouse_id ?? "");
  const whName = String(u.rows[0].name ?? "");
  const whType = String(u.rows[0].type ?? "distribution");

  const dt = await db.execute({
    sql: "SELECT id, balance FROM distribution_treasuries WHERE user_id = ? AND company_id = ?",
    args: [userId, companyId],
  });
  if (dt.rows.length === 0) {
    const id = randomUUID();
    await db.execute({
      sql: `INSERT INTO distribution_treasuries (id, company_id, user_id, warehouse_id, balance)
            VALUES (?, ?, ?, ?, 0)`,
      args: [id, companyId, userId, whId],
    });
    return {
      assignedWarehouseId: whId,
      warehouseName: whName,
      warehouseType: whType,
      distributionTreasuryId: id,
      treasuryBalance: 0,
    };
  }

  return {
    assignedWarehouseId: whId,
    warehouseName: whName,
    warehouseType: whType,
    distributionTreasuryId: String(dt.rows[0].id),
    treasuryBalance: Number(dt.rows[0].balance ?? 0),
  };
}

export async function resolveSaleWarehouseId(
  companyId: string,
  sessionUserId: string,
  sessionRole: string,
  bodyWarehouseId?: string | null
): Promise<{ warehouseId: string; distributionTreasuryId: string | null }> {
  if (sessionRole === "super_admin" || sessionRole === "tenant_owner") {
    const mainId = await ensureCompanyWarehouse(companyId);
    if (bodyWarehouseId?.trim()) {
      const w = await db.execute({
        sql: "SELECT id, type FROM warehouses WHERE id = ? AND company_id = ? AND is_active = 1",
        args: [bodyWarehouseId.trim(), companyId],
      });
      if (w.rows.length === 0) {
        throw new Error("المخزن غير موجود");
      }
      return { warehouseId: String(w.rows[0].id), distributionTreasuryId: null };
    }
    return { warehouseId: mainId, distributionTreasuryId: null };
  }

  const ctx = await getDistributionContext(sessionUserId, companyId);
  if (ctx) {
    if (bodyWarehouseId && bodyWarehouseId.trim() !== ctx.assignedWarehouseId) {
      throw new Error("لا يمكن البيع إلا من المخزن المسند لك");
    }
    return { warehouseId: ctx.assignedWarehouseId, distributionTreasuryId: ctx.distributionTreasuryId };
  }

  const mainId = await ensureCompanyWarehouse(companyId);
  return { warehouseId: mainId, distributionTreasuryId: null };
}
