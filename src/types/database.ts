/**
 * أنواع قاعدة البيانات - EFCT
 */

export type UserRole = "super_admin" | "tenant_owner" | "employee";

export type InvoiceType = "sale" | "purchase" | "maintenance";
export type InvoiceStatus = "draft" | "pending" | "paid" | "partial" | "returned" | "cancelled";

export type RepairOrderStage =
  | "received"
  | "inspection"
  | "maintenance"
  | "ready"
  | "completed";

export type WarehouseType = "main" | "distribution";
export type TreasuryType = "sales" | "workshop";

export type PaymentMethodType =
  | "cash"
  | "vodafone_cash"
  | "instapay"
  | "cheque"
  | "bank"
  | "credit";

export type StockMovementType =
  | "in"
  | "out"
  | "transfer"
  | "adjustment"
  | "workshop_install"
  | "return";

export type WalletTransactionType =
  | "credit"
  | "debit"
  | "digital_service"
  | "obd_search"
  | "assistant_company"
  | "assistant_obd_global";
