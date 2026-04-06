import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/company";
import { exportBackup } from "@/lib/backup";
import { logAudit } from "@/lib/audit";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";

  try {
    const data = await exportBackup(companyId);

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "backup_export",
      details: `تصدير نسخة احتياطية (${format})`,
    });

    if (format === "excel") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ exportedAt: data.exportedAt, companyId: data.companyId }]),
        "_meta"
      );
      const sheets: [string, Record<string, unknown>[]][] = [
        ["company", data.company ?? []],
        ["customers", data.customers ?? []],
        ["suppliers", data.suppliers ?? []],
        ["warehouses", data.warehouses ?? []],
        ["items", data.items ?? []],
        ["invoices", data.invoices ?? []],
        ["invoice_items", data.invoice_items ?? []],
        ["invoice_payments", data.invoice_payments ?? []],
        ["repair_orders", data.repair_orders ?? []],
        ["repair_order_items", data.repair_order_items ?? []],
        ["repair_order_services", data.repair_order_services ?? []],
        ["treasuries", data.treasuries ?? []],
        ["treasury_transactions", data.treasury_transactions ?? []],
        ["payment_wallets", data.payment_wallets ?? []],
        ["payment_wallet_transactions", data.payment_wallet_transactions ?? []],
        ["item_warehouse_stock", data.item_warehouse_stock ?? []],
        ["stock_movements", data.stock_movements ?? []],
        ["payment_methods", data.payment_methods ?? []],
      ];
      for (const [name, arr] of sheets) {
        if (arr.length > 0) {
          const ws = XLSX.utils.json_to_sheet(arr);
          XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
        }
      }
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const filename = `backup-${companyId}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const filename = `backup-${companyId}-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Backup export error:", error);
    return NextResponse.json({ error: "فشل في تصدير النسخة الاحتياطية" }, { status: 500 });
  }
}
