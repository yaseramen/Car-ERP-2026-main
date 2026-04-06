import { db } from "@/lib/db/client";
import { SYSTEM_COMPANY_ID } from "@/lib/company";

const SYSTEM_WAREHOUSE_ID = "warehouse-system";

/**
 * Ensures a main warehouse exists for the given company.
 * Creates company and warehouse if they don't exist (e.g. for company-system).
 * Returns the warehouse id.
 */
export async function ensureCompanyWarehouse(companyId: string): Promise<string> {
  const existing = await db.execute({
    sql: "SELECT id FROM warehouses WHERE company_id = ? AND type = 'main'",
    args: [companyId],
  });
  if (existing.rows.length > 0) return String(existing.rows[0].id);

  if (companyId === SYSTEM_COMPANY_ID) {
    const companyExisting = await db.execute({
      sql: "SELECT id FROM companies WHERE id = ?",
      args: [SYSTEM_COMPANY_ID],
    });
    if (companyExisting.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO companies (id, name, is_active) VALUES (?, ?, 1)",
        args: [SYSTEM_COMPANY_ID, "نظام EFCT"],
      });
    }
    await db.execute({
      sql: "INSERT INTO warehouses (id, company_id, name, type, is_active) VALUES (?, ?, ?, 'main', 1)",
      args: [SYSTEM_WAREHOUSE_ID, SYSTEM_COMPANY_ID, "المخزن الرئيسي"],
    });
    return SYSTEM_WAREHOUSE_ID;
  }

  const warehouseId = `wh-main-${companyId}`;
  await db.execute({
    sql: "INSERT INTO warehouses (id, company_id, name, type, is_active) VALUES (?, ?, ?, 'main', 1)",
    args: [warehouseId, companyId, "المخزن الرئيسي"],
  });
  return warehouseId;
}
