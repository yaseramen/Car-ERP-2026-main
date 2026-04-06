/**
 * طابور عمليات أوفلاين - يحفظ الطلبات عند انقطاع الإنترنت ويعيد إرسالها عند العودة
 */

const STORAGE_KEY = "alameen-offline-queue";

export type QueuedOp =
  | { type: "add_service"; orderId: string; data: { description: string; quantity: number; unit_price: number } }
  | { type: "add_part"; orderId: string; data: { item_id: string; quantity: number } }
  | {
      type: "create_sale_invoice";
      data: {
        customer_id?: string;
        items: { item_id: string; quantity: number }[];
        payment_method_id?: string;
        paid_amount?: number;
        discount?: number;
        tax?: number;
        notes?: string;
        reference_from?: string;
        reference_to?: string;
      };
    }
  | {
      type: "create_purchase_invoice";
      data: {
        supplier_id?: string;
        items: { item_id: string; quantity: number; unit_price: number }[];
        notes?: string;
        discount?: number;
        tax?: number;
      };
    }
  | { type: "add_customer"; data: { name: string; phone?: string; email?: string; address?: string; notes?: string } }
  | { type: "add_supplier"; data: { name: string; phone?: string; email?: string; address?: string; notes?: string } }
  | {
      type: "treasury_transaction";
      data: {
        type: "expense" | "income";
        treasury_id: string;
        amount: number;
        description?: string;
        payment_method_id?: string;
      };
    }
  | {
      type: "invoice_pay";
      invoiceId: string;
      data: {
        amount: number;
        payment_method_id: string;
        reference_number?: string;
        reference_from?: string;
        reference_to?: string;
        notes?: string;
      };
    }
  | {
      type: "create_repair_order";
      data: {
        vehicle_plate: string;
        vehicle_model?: string;
        vehicle_year?: number;
        mileage?: number;
        customer_id?: string;
        order_type?: "maintenance" | "inspection";
      };
    }
  | {
      type: "update_repair_order_stage";
      orderId: string;
      data: { stage: string; inspection_notes?: string };
    }
  | {
      type: "treasury_transfer";
      data: { from_id: string; to_id: string; amount: number; description?: string };
    }
  | { type: "invoice_cancel"; invoiceId: string }
  | { type: "invoice_return"; invoiceId: string }
  | {
      type: "invoice_return_partial";
      invoiceId: string;
      data: { items: { item_id: string; quantity: number }[] };
    }
  | {
      type: "treasury_settle";
      data: { from_date?: string; to_date?: string; note?: string };
    }
  | {
      type: "save_inspection_checklist";
      orderId: string;
      data: {
        results: { checklist_item_id: string; status: string; notes: string }[];
        general_notes: string;
      };
    }
  | {
      type: "inventory_item_patch";
      itemId: string;
      data: { category?: string | null; min_quantity?: number; min_quantity_enabled?: boolean };
    }
  | {
      type: "inventory_item_full_patch";
      itemId: string;
      data: {
        name?: string;
        code?: string | null;
        barcode?: string | null;
        category?: string | null;
        unit?: string;
        sale_price?: number;
        min_quantity_enabled?: boolean;
        min_quantity?: number;
        has_expiry?: boolean;
        expiry_date?: string | null;
      };
    }
  | { type: "edit_customer"; customerId: string; data: { name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null } }
  | { type: "edit_supplier"; supplierId: string; data: { name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null } }
  | { type: "add_checklist_item"; data: { name_ar: string } }
  | { type: "wallet_charge"; data: { company_id: string; amount: number; description?: string } }
  | { type: "wallet_debit"; data: { company_id: string; amount: number; description?: string } }
  | { type: "add_company"; data: { name: string; phone?: string; address?: string } }
  | { type: "delete_customer"; customerId: string }
  | { type: "delete_supplier"; supplierId: string }
  | { type: "delete_item"; itemId: string }
  | {
      type: "create_inventory_item";
      data: {
        name: string;
        code?: string;
        barcode?: string;
        category?: string;
        unit?: string;
        purchase_price?: number;
        sale_price?: number;
        min_quantity?: number;
        min_quantity_enabled?: boolean;
        has_expiry?: boolean;
        expiry_date?: string | null;
      };
    }
  | {
      type: "submit_feedback";
      data: {
        type: string;
        subject: string;
        message: string;
        screenshot_url?: string | null;
        page_path?: string | null;
      };
    }
  | {
      type: "stock_transfer";
      data: {
        item_id: string;
        from_warehouse_id: string;
        to_warehouse_id: string;
        quantity: number;
        notes?: string;
      };
    }
  | {
      type: "warehouse_patch";
      warehouseId: string;
      data: { name?: string; type?: string; location?: string | null };
    }
  | {
      type: "stock_adjustment";
      itemId: string;
      data: { new_quantity: number; warehouse_id?: string; notes?: string };
    };

export interface QueuedItem {
  id: string;
  op: QueuedOp;
  createdAt: string;
}

function loadQueue(): QueuedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function notifyQueueChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("alameen-queue-changed"));
  } catch {
    /* ignore */
  }
}

function saveQueue(items: QueuedItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    notifyQueueChanged();
  } catch {}
}

export function addToQueue(op: QueuedOp): string {
  const items = loadQueue();
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  items.push({ id, op, createdAt: new Date().toISOString() });
  saveQueue(items);
  return id;
}

export function removeFromQueue(id: string) {
  const items = loadQueue().filter((i) => i.id !== id);
  saveQueue(items);
}

export function getQueue(): QueuedItem[] {
  return loadQueue();
}

export async function processQueue(
  executor: (item: QueuedItem) => Promise<boolean>
): Promise<{ processed: number; failed: number }> {
  const items = loadQueue();
  let processed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const ok = await executor(item);
      if (ok) {
        removeFromQueue(item.id);
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  notifyQueueChanged();
  return { processed, failed };
}

/** تنفيذ افتراضي لجميع أنواع العمليات - يُستخدم في OfflineProvider */
export async function executeQueuedOpDefault(item: QueuedItem): Promise<boolean> {
  const { op } = item;
  let url: string;
  let body: string;
  let method = "POST";

  switch (op.type) {
    case "add_service":
      url = `/api/admin/workshop/orders/${op.orderId}/services`;
      body = JSON.stringify(op.data);
      break;
    case "add_part":
      url = `/api/admin/workshop/orders/${op.orderId}/items`;
      body = JSON.stringify(op.data);
      break;
    case "create_sale_invoice":
      url = "/api/admin/invoices/sale";
      body = JSON.stringify(op.data);
      break;
    case "create_purchase_invoice":
      url = "/api/admin/invoices/purchase";
      body = JSON.stringify(op.data);
      break;
    case "add_customer":
      url = "/api/admin/customers";
      body = JSON.stringify(op.data);
      break;
    case "add_supplier":
      url = "/api/admin/suppliers";
      body = JSON.stringify(op.data);
      break;
    case "treasury_transaction":
      url = "/api/admin/treasuries/transaction";
      body = JSON.stringify(op.data);
      break;
    case "invoice_pay":
      url = `/api/admin/invoices/${op.invoiceId}/pay`;
      body = JSON.stringify(op.data);
      break;
    case "create_repair_order":
      url = "/api/admin/workshop/orders";
      body = JSON.stringify(op.data);
      break;
    case "update_repair_order_stage":
      url = `/api/admin/workshop/orders/${op.orderId}`;
      body = JSON.stringify(op.data);
      method = "PATCH";
      break;
    case "treasury_transfer":
      url = "/api/admin/treasuries/transfer";
      body = JSON.stringify(op.data);
      break;
    case "invoice_cancel":
      url = `/api/admin/invoices/${op.invoiceId}/cancel`;
      body = "{}";
      break;
    case "invoice_return":
      url = `/api/admin/invoices/${op.invoiceId}/return`;
      body = "{}";
      break;
    case "invoice_return_partial":
      url = `/api/admin/invoices/${op.invoiceId}/return-partial`;
      body = JSON.stringify(op.data);
      break;
    case "treasury_settle":
      url = "/api/admin/treasuries/settle";
      body = JSON.stringify(op.data);
      break;
    case "save_inspection_checklist":
      url = `/api/admin/workshop/orders/${op.orderId}/inspection-results`;
      body = JSON.stringify(op.data);
      method = "PUT";
      break;
    case "inventory_item_patch":
      url = `/api/admin/inventory/items/${op.itemId}`;
      body = JSON.stringify(op.data);
      method = "PATCH";
      break;
    case "inventory_item_full_patch":
      url = `/api/admin/inventory/items/${op.itemId}`;
      body = JSON.stringify(op.data);
      method = "PATCH";
      break;
    case "edit_customer":
      url = `/api/admin/customers/${op.customerId}`;
      body = JSON.stringify(op.data);
      method = "PATCH";
      break;
    case "edit_supplier":
      url = `/api/admin/suppliers/${op.supplierId}`;
      body = JSON.stringify(op.data);
      method = "PATCH";
      break;
    case "add_checklist_item":
      url = "/api/admin/workshop/inspection-checklist";
      body = JSON.stringify(op.data);
      break;
    case "wallet_charge":
      url = "/api/admin/wallets/charge";
      body = JSON.stringify(op.data);
      break;
    case "wallet_debit":
      url = "/api/admin/wallets/debit";
      body = JSON.stringify(op.data);
      break;
    case "add_company":
      url = "/api/admin/wallets/companies";
      body = JSON.stringify(op.data);
      break;
    case "delete_customer":
      url = `/api/admin/customers/${op.customerId}`;
      body = "{}";
      method = "DELETE";
      break;
    case "delete_supplier":
      url = `/api/admin/suppliers/${op.supplierId}`;
      body = "{}";
      method = "DELETE";
      break;
    case "delete_item":
      url = `/api/admin/inventory/items/${op.itemId}`;
      body = "{}";
      method = "DELETE";
      break;
    case "create_inventory_item":
      url = "/api/admin/inventory/items";
      body = JSON.stringify(op.data);
      break;
    case "submit_feedback":
      url = "/api/feedback";
      body = JSON.stringify(op.data);
      break;
    case "stock_transfer":
      url = "/api/admin/inventory/transfer";
      body = JSON.stringify(op.data);
      break;
    case "warehouse_patch":
      url = `/api/admin/warehouses/${op.warehouseId}`;
      body = JSON.stringify(op.data);
      method = "PATCH";
      break;
    case "stock_adjustment":
      // التعديل اليدوي للمخزون معطّل — نتجاهل العمليات القديمة في الطابور
      return true;
    default:
      return false;
  }

  const timeoutMs = 35_000;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        return false;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    } catch {
      window.clearTimeout(timer);
      if (attempt === maxAttempts) return false;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return false;
}
