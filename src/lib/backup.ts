/**
 * تصدير واستعادة النسخ الاحتياطية
 */
import type { InArgs } from "@libsql/core/api";
import { db } from "./db/client";
import { syncInvoiceNumberSequencesFromInvoices } from "./invoice-numbers";

function toInValue(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

export type BackupModules =
  | "company"
  | "customers"
  | "suppliers"
  | "warehouses"
  | "items"
  | "invoices"
  | "repair_orders"
  | "treasuries"
  | "stock_movements"
  | "payment_methods";

const ALL_MODULES: BackupModules[] = [
  "company",
  "customers",
  "suppliers",
  "warehouses",
  "items",
  "invoices",
  "repair_orders",
  "treasuries",
  "stock_movements",
  "payment_methods",
];

export interface BackupData {
  version: number;
  exportedAt: string;
  companyId: string;
  company?: Record<string, unknown>[];
  customers?: Record<string, unknown>[];
  suppliers?: Record<string, unknown>[];
  warehouses?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  invoices?: Record<string, unknown>[];
  invoice_items?: Record<string, unknown>[];
  invoice_payments?: Record<string, unknown>[];
  repair_orders?: Record<string, unknown>[];
  repair_order_items?: Record<string, unknown>[];
  repair_order_services?: Record<string, unknown>[];
  treasuries?: Record<string, unknown>[];
  treasury_transactions?: Record<string, unknown>[];
  payment_wallets?: Record<string, unknown>[];
  payment_wallet_transactions?: Record<string, unknown>[];
  item_warehouse_stock?: Record<string, unknown>[];
  stock_movements?: Record<string, unknown>[];
  payment_methods?: Record<string, unknown>[];
}

function rowToObj(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v;
  }
  return out;
}

export async function exportBackup(companyId: string, modules?: BackupModules[]): Promise<BackupData> {
  const mods = modules && modules.length > 0 ? modules : ALL_MODULES;
  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    companyId,
  };

  if (mods.includes("company")) {
    const r = await db.execute({
      sql: "SELECT * FROM companies WHERE id = ?",
      args: [companyId],
    });
    data.company = r.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  if (mods.includes("customers")) {
    const r = await db.execute({ sql: "SELECT * FROM customers WHERE company_id = ?", args: [companyId] });
    data.customers = r.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  if (mods.includes("suppliers")) {
    const r = await db.execute({ sql: "SELECT * FROM suppliers WHERE company_id = ?", args: [companyId] });
    data.suppliers = r.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  if (mods.includes("warehouses")) {
    const r = await db.execute({ sql: "SELECT * FROM warehouses WHERE company_id = ?", args: [companyId] });
    data.warehouses = r.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  if (mods.includes("items")) {
    const r = await db.execute({ sql: "SELECT * FROM items WHERE company_id = ?", args: [companyId] });
    data.items = r.rows.map((row) => rowToObj(row as Record<string, unknown>));
    const iws = await db.execute({
      sql: `SELECT iws.* FROM item_warehouse_stock iws
            JOIN items i ON i.id = iws.item_id WHERE i.company_id = ?`,
      args: [companyId],
    });
    data.item_warehouse_stock = iws.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  if (mods.includes("payment_methods")) {
    const r = await db.execute({
      sql: "SELECT * FROM payment_methods WHERE company_id IS NULL OR company_id = ?",
      args: [companyId],
    });
    data.payment_methods = r.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  if (mods.includes("invoices")) {
    const inv = await db.execute({ sql: "SELECT * FROM invoices WHERE company_id = ?", args: [companyId] });
    data.invoices = inv.rows.map((row) => rowToObj(row as Record<string, unknown>));
    const invIds = (data.invoices as { id: string }[]).map((i) => i.id);
    if (invIds.length > 0) {
      const placeholders = invIds.map(() => "?").join(",");
      const items = await db.execute({
        sql: `SELECT * FROM invoice_items WHERE invoice_id IN (${placeholders})`,
        args: invIds,
      });
      data.invoice_items = items.rows.map((row) => rowToObj(row as Record<string, unknown>));
      const pay = await db.execute({
        sql: `SELECT * FROM invoice_payments WHERE invoice_id IN (${placeholders})`,
        args: invIds,
      });
      data.invoice_payments = pay.rows.map((row) => rowToObj(row as Record<string, unknown>));
    } else {
      data.invoice_items = [];
      data.invoice_payments = [];
    }
  }

  if (mods.includes("repair_orders")) {
    const ro = await db.execute({ sql: "SELECT * FROM repair_orders WHERE company_id = ?", args: [companyId] });
    data.repair_orders = ro.rows.map((row) => rowToObj(row as Record<string, unknown>));
    const roIds = (data.repair_orders as { id: string }[]).map((r) => r.id);
    if (roIds.length > 0) {
      const ph = roIds.map(() => "?").join(",");
      const roi = await db.execute({
        sql: `SELECT * FROM repair_order_items WHERE repair_order_id IN (${ph})`,
        args: roIds,
      });
      data.repair_order_items = roi.rows.map((row) => rowToObj(row as Record<string, unknown>));
      const ros = await db.execute({
        sql: `SELECT * FROM repair_order_services WHERE repair_order_id IN (${ph})`,
        args: roIds,
      });
      data.repair_order_services = ros.rows.map((row) => rowToObj(row as Record<string, unknown>));
    } else {
      data.repair_order_items = [];
      data.repair_order_services = [];
    }
  }

  if (mods.includes("treasuries")) {
    const tr = await db.execute({ sql: "SELECT * FROM treasuries WHERE company_id = ?", args: [companyId] });
    data.treasuries = tr.rows.map((row) => rowToObj(row as Record<string, unknown>));
    const trIds = (data.treasuries as { id: string }[]).map((t) => t.id);
    if (trIds.length > 0) {
      const ph = trIds.map(() => "?").join(",");
      const ttx = await db.execute({
        sql: `SELECT * FROM treasury_transactions WHERE treasury_id IN (${ph})`,
        args: trIds,
      });
      data.treasury_transactions = ttx.rows.map((row) => rowToObj(row as Record<string, unknown>));
    } else {
      data.treasury_transactions = [];
    }
    const pw = await db.execute({ sql: "SELECT * FROM payment_wallets WHERE company_id = ?", args: [companyId] });
    data.payment_wallets = pw.rows.map((row) => rowToObj(row as Record<string, unknown>));
    const pwIds = (data.payment_wallets as { id: string }[]).map((p) => p.id);
    if (pwIds.length > 0) {
      const ph2 = pwIds.map(() => "?").join(",");
      const pwtx = await db.execute({
        sql: `SELECT * FROM payment_wallet_transactions WHERE payment_wallet_id IN (${ph2})`,
        args: pwIds,
      });
      data.payment_wallet_transactions = pwtx.rows.map((row) => rowToObj(row as Record<string, unknown>));
    } else {
      data.payment_wallet_transactions = [];
    }
  }

  if (mods.includes("stock_movements")) {
    const sm = await db.execute({
      sql: `SELECT sm.* FROM stock_movements sm
            JOIN items i ON i.id = sm.item_id WHERE i.company_id = ?`,
      args: [companyId],
    });
    data.stock_movements = sm.rows.map((row) => rowToObj(row as Record<string, unknown>));
  }

  return data;
}

export type RestoreMode = "replace" | "merge";

export interface RestoreOptions {
  mode: RestoreMode;
  modules?: BackupModules[];
  currentUserId: string;
}

export async function restoreBackup(
  companyId: string,
  data: BackupData,
  options: RestoreOptions
): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
  const mods = options.modules && options.modules.length > 0 ? options.modules : ALL_MODULES;
  const userId = options.currentUserId;

  if (data.companyId !== companyId) {
    return { success: false, message: "النسخة الاحتياطية لا تطابق شركتك" };
  }

  const counts: Record<string, number> = {};

  try {
    if (options.mode === "replace") {
      await db.execute({ sql: "UPDATE invoices SET repair_order_id = NULL WHERE company_id = ?", args: [companyId] });
      await db.execute({ sql: "UPDATE repair_orders SET invoice_id = NULL WHERE company_id = ?", args: [companyId] });

      const invIds = await db.execute({
        sql: "SELECT id FROM invoices WHERE company_id = ?",
        args: [companyId],
      });
      for (const row of invIds.rows) {
        const id = String(row.id ?? "");
        await db.execute({ sql: "DELETE FROM invoice_payments WHERE invoice_id = ?", args: [id] });
        await db.execute({ sql: "DELETE FROM invoice_items WHERE invoice_id = ?", args: [id] });
      }
      await db.execute({ sql: "DELETE FROM invoices WHERE company_id = ?", args: [companyId] });

      const roIds = await db.execute({ sql: "SELECT id FROM repair_orders WHERE company_id = ?", args: [companyId] });
      for (const row of roIds.rows) {
        const id = String(row.id ?? "");
        await db.execute({ sql: "DELETE FROM repair_order_services WHERE repair_order_id = ?", args: [id] });
        await db.execute({ sql: "DELETE FROM repair_order_items WHERE repair_order_id = ?", args: [id] });
      }
      await db.execute({ sql: "DELETE FROM repair_orders WHERE company_id = ?", args: [companyId] });

      const trIds = await db.execute({ sql: "SELECT id FROM treasuries WHERE company_id = ?", args: [companyId] });
      for (const row of trIds.rows) {
        await db.execute({ sql: "DELETE FROM treasury_transactions WHERE treasury_id = ?", args: [row.id] });
      }
      await db.execute({ sql: "DELETE FROM treasuries WHERE company_id = ?", args: [companyId] });

      const pwDel = await db.execute({ sql: "SELECT id FROM payment_wallets WHERE company_id = ?", args: [companyId] });
      for (const row of pwDel.rows) {
        await db.execute({ sql: "DELETE FROM payment_wallet_transactions WHERE payment_wallet_id = ?", args: [row.id] });
      }
      await db.execute({ sql: "DELETE FROM payment_wallets WHERE company_id = ?", args: [companyId] });

      await db.execute({
        sql: "DELETE FROM stock_movements WHERE item_id IN (SELECT id FROM items WHERE company_id = ?)",
        args: [companyId],
      });
      await db.execute({
        sql: "DELETE FROM item_warehouse_stock WHERE item_id IN (SELECT id FROM items WHERE company_id = ?)",
        args: [companyId],
      });
      await db.execute({ sql: "DELETE FROM items WHERE company_id = ?", args: [companyId] });
      await db.execute({ sql: "DELETE FROM customers WHERE company_id = ?", args: [companyId] });
      await db.execute({ sql: "DELETE FROM suppliers WHERE company_id = ?", args: [companyId] });
      await db.execute({ sql: "DELETE FROM warehouses WHERE company_id = ?", args: [companyId] });
    }

    const idMap = new Map<string, string>();
    const { randomUUID } = await import("crypto");
    const mapId = (oldId: string | null | undefined): string | null => {
      if (!oldId) return null;
      if (options.mode === "replace") return oldId;
      if (!idMap.has(oldId)) idMap.set(oldId, randomUUID());
      return idMap.get(oldId)!;
    };

    if (mods.includes("company") && data.company?.length) {
      const c = data.company[0] as Record<string, unknown>;
      await db.execute({
        sql: `UPDATE companies SET name=?, phone=?, address=?, tax_number=?, commercial_registration=?, updated_at=datetime('now') WHERE id=?`,
        args: [
          String(c.name ?? ""),
          toInValue(c.phone),
          toInValue(c.address),
          toInValue(c.tax_number),
          toInValue(c.commercial_registration),
          companyId,
        ] as InArgs,
      });
      counts.company = 1;
    }

    if (mods.includes("customers") && data.customers?.length) {
      for (const row of data.customers as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        await db.execute({
          sql: `INSERT OR REPLACE INTO customers (id, company_id, name, phone, email, address, tax_number, notes, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            String(row.name ?? ""),
            toInValue(row.phone),
            toInValue(row.email),
            toInValue(row.address),
            toInValue(row.tax_number),
            toInValue(row.notes),
            Number(row.is_active ?? 1),
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.customers = (data.customers as unknown[]).length;
    }

    if (mods.includes("suppliers") && data.suppliers?.length) {
      for (const row of data.suppliers as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        await db.execute({
          sql: `INSERT OR REPLACE INTO suppliers (id, company_id, name, phone, email, address, tax_number, notes, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            String(row.name ?? ""),
            toInValue(row.phone),
            toInValue(row.email),
            toInValue(row.address),
            toInValue(row.tax_number),
            toInValue(row.notes),
            Number(row.is_active ?? 1),
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.suppliers = (data.suppliers as unknown[]).length;
    }

    if (mods.includes("warehouses") && data.warehouses?.length) {
      for (const row of data.warehouses as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        await db.execute({
          sql: `INSERT OR REPLACE INTO warehouses (id, company_id, name, type, location, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            String(row.name ?? ""),
            String(row.type ?? "main"),
            toInValue(row.location),
            Number(row.is_active ?? 1),
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.warehouses = (data.warehouses as unknown[]).length;
    }

    if (mods.includes("items") && data.items?.length) {
      for (const row of data.items as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        await db.execute({
          sql: `INSERT OR REPLACE INTO items (id, company_id, name, code, barcode, category, unit, purchase_price, sale_price, min_quantity, has_expiry, expiry_date, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            String(row.name ?? ""),
            toInValue(row.code),
            toInValue(row.barcode),
            toInValue(row.category),
            String(row.unit ?? "قطعة"),
            Number(row.purchase_price ?? 0),
            Number(row.sale_price ?? 0),
            Number(row.min_quantity ?? 0),
            Number(row.has_expiry ?? 0),
            toInValue(row.expiry_date),
            Number(row.is_active ?? 1),
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.items = (data.items as unknown[]).length;

      if (data.item_warehouse_stock?.length) {
        for (const row of data.item_warehouse_stock as Record<string, unknown>[]) {
          const itemId = mapId(row.item_id as string) ?? (row.item_id as string);
          const whId = mapId(row.warehouse_id as string) ?? (row.warehouse_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT OR REPLACE INTO item_warehouse_stock (id, item_id, warehouse_id, quantity, reserved_quantity, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [id, itemId, whId, Number(row.quantity ?? 0), Number(row.reserved_quantity ?? 0), new Date().toISOString()] as InArgs,
          });
        }
      }
    }

    if (mods.includes("treasuries") && data.treasuries?.length) {
      for (const row of data.treasuries as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        await db.execute({
          sql: `INSERT OR REPLACE INTO treasuries (id, company_id, name, type, balance, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            String(row.name ?? ""),
            String(row.type ?? "sales"),
            Number(row.balance ?? 0),
            Number(row.is_active ?? 1),
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.treasuries = (data.treasuries as unknown[]).length;

      if (data.treasury_transactions?.length) {
        for (const row of data.treasury_transactions as Record<string, unknown>[]) {
          const trId = mapId(row.treasury_id as string) ?? (row.treasury_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT INTO treasury_transactions (id, treasury_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              trId,
              Number(row.amount ?? 0),
              String(row.type ?? "in"),
              toInValue(row.description),
              toInValue(row.reference_type),
              toInValue(row.reference_id),
              toInValue(row.payment_method_id),
              userId,
              String(row.created_at ?? new Date().toISOString()),
            ] as InArgs,
          });
        }
      }

      if (data.payment_wallets?.length) {
        for (const row of data.payment_wallets as Record<string, unknown>[]) {
          const id = mapId(row.id as string) ?? (row.id as string);
          await db.execute({
            sql: `INSERT OR REPLACE INTO payment_wallets (id, company_id, payment_channel, phone_digits, name, balance, is_active, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              companyId,
              String(row.payment_channel ?? "vodafone_cash"),
              String(row.phone_digits ?? ""),
              String(row.name ?? ""),
              Number(row.balance ?? 0),
              Number(row.is_active ?? 1),
              String(row.created_at ?? new Date().toISOString()),
              String(row.updated_at ?? new Date().toISOString()),
            ] as InArgs,
          });
        }
        counts.payment_wallets = (data.payment_wallets as unknown[]).length;
      }

      if (data.payment_wallet_transactions?.length) {
        for (const row of data.payment_wallet_transactions as Record<string, unknown>[]) {
          const wId = mapId(row.payment_wallet_id as string) ?? (row.payment_wallet_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT INTO payment_wallet_transactions (id, payment_wallet_id, amount, type, description, reference_type, reference_id, payment_method_id, performed_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              wId,
              Number(row.amount ?? 0),
              String(row.type ?? "in"),
              toInValue(row.description),
              toInValue(row.reference_type),
              toInValue(row.reference_id),
              toInValue(row.payment_method_id),
              userId,
              String(row.created_at ?? new Date().toISOString()),
            ] as InArgs,
          });
        }
      }
    }

    if (mods.includes("repair_orders") && data.repair_orders?.length) {
      for (const row of data.repair_orders as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        const custId = mapId(row.customer_id as string);
        const whId = mapId(row.warehouse_id as string);
        let orderNum = String(row.order_number ?? "");
        if (options.mode === "merge") orderNum = `${orderNum}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.execute({
          sql: `INSERT OR REPLACE INTO repair_orders (id, company_id, order_number, order_type, customer_id, vehicle_plate, vehicle_model, vehicle_year, mileage, vin, stage, received_at, inspection_notes, estimated_completion, completed_at, invoice_id, warehouse_id, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            orderNum,
            String(row.order_type ?? "maintenance"),
            custId,
            toInValue(row.vehicle_plate),
            toInValue(row.vehicle_model),
            toInValue(row.vehicle_year),
            toInValue(row.mileage),
            toInValue(row.vin),
            String(row.stage ?? "received"),
            toInValue(row.received_at),
            toInValue(row.inspection_notes),
            toInValue(row.estimated_completion),
            toInValue(row.completed_at),
            null,
            whId,
            userId,
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.repair_orders = (data.repair_orders as unknown[]).length;

      if (data.repair_order_items?.length) {
        for (const row of data.repair_order_items as Record<string, unknown>[]) {
          const roId = mapId(row.repair_order_id as string) ?? (row.repair_order_id as string);
          const itemId = mapId(row.item_id as string) ?? (row.item_id as string);
          const whId = mapId(row.warehouse_id as string) ?? (row.warehouse_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT INTO repair_order_items (id, repair_order_id, item_id, warehouse_id, quantity, unit_price, total, created_at, discount_type, discount_value, tax_percent)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              roId,
              itemId,
              whId,
              Number(row.quantity ?? 0),
              Number(row.unit_price ?? 0),
              Number(row.total ?? 0),
              String(row.created_at ?? new Date().toISOString()),
              row.discount_type ?? null,
              Number(row.discount_value ?? 0),
              row.tax_percent != null ? Number(row.tax_percent) : null,
            ] as InArgs,
          });
        }
      }

      if (data.repair_order_services?.length) {
        for (const row of data.repair_order_services as Record<string, unknown>[]) {
          const roId = mapId(row.repair_order_id as string) ?? (row.repair_order_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT INTO repair_order_services (id, repair_order_id, description, quantity, unit_price, total, created_at, discount_type, discount_value, tax_percent)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              roId,
              String(row.description ?? ""),
              Number(row.quantity ?? 1),
              Number(row.unit_price ?? 0),
              Number(row.total ?? 0),
              String(row.created_at ?? new Date().toISOString()),
              row.discount_type ?? null,
              Number(row.discount_value ?? 0),
              row.tax_percent != null ? Number(row.tax_percent) : null,
            ] as InArgs,
          });
        }
      }
    }

    if (mods.includes("invoices") && data.invoices?.length) {
      for (const row of data.invoices as Record<string, unknown>[]) {
        const id = mapId(row.id as string) ?? (row.id as string);
        const custId = mapId(row.customer_id as string);
        const supId = mapId(row.supplier_id as string);
        const whId = mapId(row.warehouse_id as string);
        const trId = mapId(row.treasury_id as string);
        const roId = mapId(row.repair_order_id as string);
        let invNum = String(row.invoice_number ?? "");
        if (options.mode === "merge") invNum = `${invNum}-${Date.now().toString(36)}`;
        await db.execute({
          sql: `INSERT OR REPLACE INTO invoices (id, company_id, invoice_number, type, status, customer_id, supplier_id, repair_order_id, warehouse_id, treasury_id, subtotal, discount, tax, digital_service_fee, total, paid_amount, notes, is_return, original_invoice_id, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            companyId,
            invNum,
            String(row.type ?? "sale"),
            String(row.status ?? "pending"),
            custId,
            supId,
            roId,
            whId,
            trId,
            Number(row.subtotal ?? 0),
            Number(row.discount ?? 0),
            Number(row.tax ?? 0),
            Number(row.digital_service_fee ?? 0),
            Number(row.total ?? 0),
            Number(row.paid_amount ?? 0),
            toInValue(row.notes),
            Number(row.is_return ?? 0),
            mapId(row.original_invoice_id as string),
            userId,
            String(row.created_at ?? new Date().toISOString()),
            String(row.updated_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.invoices = (data.invoices as unknown[]).length;

      if (data.invoice_items?.length) {
        for (const row of data.invoice_items as Record<string, unknown>[]) {
          const invId = mapId(row.invoice_id as string) ?? (row.invoice_id as string);
          const itemId = mapId(row.item_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT INTO invoice_items (id, invoice_id, item_id, description, quantity, unit_price, discount, total, sort_order, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              invId,
              itemId,
              toInValue(row.description),
              Number(row.quantity ?? 0),
              Number(row.unit_price ?? 0),
              Number(row.discount ?? 0),
              Number(row.total ?? 0),
              Number(row.sort_order ?? 0),
              String(row.created_at ?? new Date().toISOString()),
            ] as InArgs,
          });
        }
      }

      if (data.invoice_payments?.length) {
        for (const row of data.invoice_payments as Record<string, unknown>[]) {
          const invId = mapId(row.invoice_id as string) ?? (row.invoice_id as string);
          const id = mapId(row.id as string) ?? randomUUID();
          await db.execute({
            sql: `INSERT INTO invoice_payments (id, invoice_id, amount, payment_method_id, treasury_id, distribution_treasury_id, payment_wallet_id, reference_number, reference_from, reference_to, notes, created_by, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              id,
              invId,
              Number(row.amount ?? 0),
              toInValue(row.payment_method_id),
              mapId(row.treasury_id as string),
              mapId(row.distribution_treasury_id as string),
              mapId(row.payment_wallet_id as string),
              toInValue(row.reference_number),
              toInValue(row.reference_from),
              toInValue(row.reference_to),
              toInValue(row.notes),
              userId,
              String(row.created_at ?? new Date().toISOString()),
            ] as InArgs,
          });
        }
      }
    }

    if (mods.includes("repair_orders") && data.repair_orders?.length && data.invoices?.length) {
      for (const row of data.repair_orders as Record<string, unknown>[]) {
        const roId = mapId(row.id as string) ?? (row.id as string);
        const invId = mapId(row.invoice_id as string);
        if (invId) {
          await db.execute({
            sql: "UPDATE repair_orders SET invoice_id = ? WHERE id = ? AND company_id = ?",
            args: [invId, roId, companyId],
          });
        }
      }
    }

    if (mods.includes("stock_movements") && data.stock_movements?.length) {
      for (const row of data.stock_movements as Record<string, unknown>[]) {
        const itemId = mapId(row.item_id as string) ?? (row.item_id as string);
        const whId = mapId(row.warehouse_id as string) ?? (row.warehouse_id as string);
        const id = mapId(row.id as string) ?? randomUUID();
        await db.execute({
          sql: `INSERT INTO stock_movements (id, item_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, performed_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            itemId,
            whId,
            Number(row.quantity ?? 0),
            String(row.movement_type ?? "in"),
            toInValue(row.reference_type),
            toInValue(row.reference_id),
            toInValue(row.notes),
            userId,
            String(row.created_at ?? new Date().toISOString()),
          ] as InArgs,
        });
      }
      counts.stock_movements = (data.stock_movements as unknown[]).length;
    }

    const hasSubstantialData =
      (data.invoices?.length ?? 0) > 0 ||
      (data.customers?.length ?? 0) > 5 ||
      (data.items?.length ?? 0) > 5;
    if (hasSubstantialData) {
      const companyRow = await db.execute({
        sql: "SELECT created_at FROM companies WHERE id = ?",
        args: [companyId],
      });
      const backupExportedAt = data.exportedAt ? new Date(data.exportedAt).getTime() : 0;
      const companyCreatedAt = companyRow.rows[0]?.created_at
        ? new Date(String(companyRow.rows[0].created_at)).getTime()
        : 0;
      const isSuspiciousRestore =
        backupExportedAt > 0 && companyCreatedAt > 0 && backupExportedAt < companyCreatedAt;
      if (isSuspiciousRestore) {
        const wallet = await db.execute({
          sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
          args: [companyId],
        });
        if (wallet.rows.length > 0) {
          const balance = Number(wallet.rows[0].balance ?? 0);
          if (balance > 0) {
            const WELCOME_GIFT = 50;
            const newBalance = Math.max(0, balance - WELCOME_GIFT);
            await db.execute({
              sql: "UPDATE company_wallets SET balance = ?, updated_at = datetime('now') WHERE company_id = ?",
              args: [newBalance, companyId],
            });
          }
        }
      }
    }

    await syncInvoiceNumberSequencesFromInvoices(companyId);

    return { success: true, message: "تمت الاستعادة بنجاح", counts };
  } catch (err) {
    console.error("Restore error:", err);
    return { success: false, message: String((err as Error)?.message ?? "فشل في الاستعادة") };
  }
}
