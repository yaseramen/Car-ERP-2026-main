import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/company";
import { restoreBackup, type BackupData } from "@/lib/backup";
import * as XLSX from "xlsx";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "replace";
    const modulesStr = formData.get("modules") as string | null;

    if (!file) {
      return NextResponse.json({ error: "لم يتم رفع ملف" }, { status: 400 });
    }

    const modules = modulesStr ? (JSON.parse(modulesStr) as string[]) : undefined;
    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();

    let data: BackupData;

    if (name.endsWith(".json")) {
      const text = buffer.toString("utf-8");
      data = JSON.parse(text) as BackupData;
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const toArr = (sheetName: string): Record<string, unknown>[] => {
        const sh = wb.Sheets[sheetName];
        if (!sh) return [];
        return XLSX.utils.sheet_to_json(sh) as Record<string, unknown>[];
      };
      const meta = toArr("_meta")[0] as Record<string, unknown> | undefined;
      data = {
        version: 1,
        exportedAt: (meta?.exportedAt ? String(meta.exportedAt) : new Date().toISOString()),
        companyId,
      };
      data.company = toArr("company");
      data.customers = toArr("customers");
      data.suppliers = toArr("suppliers");
      data.warehouses = toArr("warehouses");
      data.items = toArr("items");
      data.invoices = toArr("invoices");
      data.invoice_items = toArr("invoice_items");
      data.invoice_payments = toArr("invoice_payments");
      data.repair_orders = toArr("repair_orders");
      data.repair_order_items = toArr("repair_order_items");
      data.repair_order_services = toArr("repair_order_services");
      data.treasuries = toArr("treasuries");
      data.treasury_transactions = toArr("treasury_transactions");
      data.item_warehouse_stock = toArr("item_warehouse_stock");
      data.stock_movements = toArr("stock_movements");
      data.payment_methods = toArr("payment_methods");
      const firstCompany = data.company?.[0] as Record<string, unknown> | undefined;
      if (firstCompany?.id) data.companyId = String(firstCompany.id);
    } else {
      return NextResponse.json({ error: "صيغة الملف غير مدعومة (JSON أو Excel)" }, { status: 400 });
    }

    if (!data.companyId) {
      return NextResponse.json({ error: "ملف النسخة الاحتياطية غير صالح" }, { status: 400 });
    }

    const result = await restoreBackup(companyId, data, {
      mode: mode === "merge" ? "merge" : "replace",
      modules: modules as ("company" | "customers" | "suppliers" | "warehouses" | "items" | "invoices" | "repair_orders" | "treasuries" | "stock_movements" | "payment_methods")[] | undefined,
      currentUserId: session.user.id!,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message, counts: result.counts });
  } catch (error) {
    console.error("Restore error:", error);
    return NextResponse.json(
      { error: String((error as Error)?.message ?? "فشل في الاستعادة") },
      { status: 500 }
    );
  }
}
