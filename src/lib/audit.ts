import { db } from "./db/client";
import { randomUUID } from "crypto";

export type AuditAction =
  | "invoice_create"
  | "invoice_update"
  | "invoice_pay"
  | "invoice_cancel"
  | "invoice_return"
  | "customer_create"
  | "customer_update"
  | "customer_delete"
  | "supplier_create"
  | "supplier_update"
  | "supplier_delete"
  | "item_create"
  | "item_update"
  | "item_delete"
  | "inventory_import"
  | "stock_adjust"
  | "stock_transfer"
  | "treasury_transaction"
  | "treasury_expense"
  | "treasury_income"
  | "backup_export"
  | "backup_restore"
  | "password_reset_code_issue"
  | "user_delete";

export async function logAudit(params: {
  companyId: string;
  userId?: string;
  userName?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: string;
}): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO audit_log (id, company_id, user_id, user_name, action, entity_type, entity_id, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        params.companyId,
        params.userId ?? null,
        params.userName ?? null,
        params.action,
        params.entityType ?? null,
        params.entityId ?? null,
        params.details ?? null,
      ],
    });
  } catch (e) {
    console.error("Audit log error:", e);
  }
}
