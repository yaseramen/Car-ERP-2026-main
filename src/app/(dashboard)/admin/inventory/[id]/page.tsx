import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { EditMinQuantity } from "./edit-min-quantity";
import { PrintBarcodeButton } from "./print-barcode-button";
import { expiryUiStatus, formatExpiryArLabel } from "@/lib/item-expiry";

export default async function ItemReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const companyId = getCompanyId(session);
  const allowed = session.user.role === "super_admin" || session.user.role === "tenant_owner" ||
    (session.user.role === "employee" && session.user.id && companyId && await canAccess(session.user.id, session.user.role ?? "", companyId, "inventory", "read"));
  if (!allowed || !companyId) redirect("/login");

  const { id } = await params;

  try {
    const itemResult = await db.execute({
      sql: `SELECT i.*, 
            COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = i.id), 0) as total_quantity
            FROM items i 
            WHERE i.id = ? AND i.company_id = ?`,
      args: [id, companyId],
    });

    if (itemResult.rows.length === 0) notFound();

    const row = itemResult.rows[0];
    const hasExpiry = Number(row.has_expiry ?? 0) === 1;
    const expiryDate = row.expiry_date ? String(row.expiry_date) : null;
    const expiryStatus = expiryUiStatus(hasExpiry, expiryDate);
    const expiryLabel = formatExpiryArLabel(expiryStatus, expiryDate);

    const item = {
      name: String(row.name ?? ""),
      code: row.code ? String(row.code) : null,
      barcode: row.barcode ? String(row.barcode) : null,
      category: row.category ? String(row.category) : null,
      unit: String(row.unit ?? "قطعة"),
      purchase_price: Number(row.purchase_price ?? 0),
      sale_price: Number(row.sale_price ?? 0),
      min_quantity: Number(row.min_quantity ?? 0),
      total_quantity: Number(row.total_quantity ?? 0),
      has_expiry: hasExpiry,
      expiry_date: expiryDate,
      expiry_label: expiryLabel,
      expiry_status: expiryStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    const movementsResult = await db.execute({
      sql: `SELECT sm.*, w.name as warehouse_name 
            FROM stock_movements sm 
            LEFT JOIN warehouses w ON sm.warehouse_id = w.id 
            WHERE sm.item_id = ? 
            ORDER BY sm.created_at DESC 
            LIMIT 100`,
      args: [id],
    });

    const stockResult = await db.execute({
      sql: `SELECT iws.*, w.name as warehouse_name 
            FROM item_warehouse_stock iws 
            JOIN warehouses w ON iws.warehouse_id = w.id 
            WHERE iws.item_id = ?`,
      args: [id],
    });

    const invoiceItemsResult = await db.execute({
      sql: `SELECT ii.*, inv.invoice_number, inv.type as invoice_type, inv.created_at
            FROM invoice_items ii 
            JOIN invoices inv ON ii.invoice_id = inv.id 
            WHERE ii.item_id = ? 
            ORDER BY inv.created_at DESC 
            LIMIT 50`,
      args: [id],
    });

    const movementLabels: Record<string, string> = {
      in: "إدخال",
      out: "إخراج",
      transfer: "نقل",
      adjustment: "تعديل",
      workshop_install: "تركيب ورشة",
      return: "مرتجع",
    };

    const stockByWarehouse = stockResult.rows.map((r) => ({
      warehouse_name: String(r.warehouse_name ?? ""),
      quantity: Number(r.quantity ?? 0),
      reserved: Number(r.reserved_quantity ?? 0),
    }));

    const movements = movementsResult.rows.map((m) => ({
      id: String(m.id),
      quantity: Number(m.quantity),
      movement_type: String(m.movement_type),
      warehouse_name: m.warehouse_name ? String(m.warehouse_name) : null,
      reference_type: m.reference_type ? String(m.reference_type) : null,
      reference_id: m.reference_id ? String(m.reference_id) : null,
      notes: m.notes ? String(m.notes) : null,
      created_at: String(m.created_at ?? ""),
    }));

    const invoiceHistory = invoiceItemsResult.rows.map((ii) => ({
      invoice_number: String(ii.invoice_number ?? ""),
      invoice_type: String(ii.invoice_type ?? ""),
      quantity: Number(ii.quantity ?? 0),
      unit_price: Number(ii.unit_price ?? 0),
      total: Number(ii.total ?? 0),
      created_at: String(ii.created_at ?? ""),
    }));

    return (
      <div className="p-4 md:p-8">
        <div className="mb-6">
          <Link
            href="/admin/inventory"
            className="text-sm text-emerald-600 hover:text-emerald-700"
          >
            ← العودة للمخزن
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{item.name}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">تقرير شامل للصنف</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">البيانات الأساسية</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">الكود</dt>
                <dd className="text-gray-900 font-medium">{item.code || "—"}</dd>
              </div>
              <div className="flex justify-between items-start gap-2">
                <dt className="text-gray-500 shrink-0">الباركود</dt>
                <dd className="text-gray-900 font-mono flex flex-col gap-2">
                  <span>{item.barcode || "—"}</span>
                  <PrintBarcodeButton
                    barcode={item.barcode || ""}
                    itemName={item.name}
                    salePrice={item.sale_price}
                    hasExpiry={item.has_expiry}
                    expiryDate={item.expiry_date}
                  />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">القسم</dt>
                <dd className="text-gray-900">{item.category || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">الوحدة</dt>
                <dd className="text-gray-900">{item.unit || "قطعة"}</dd>
              </div>
              <div className="flex justify-between items-start gap-2">
                <dt className="text-gray-500 shrink-0">الصلاحية</dt>
                <dd className="text-gray-900 text-left">
                  {item.expiry_label ? (
                    <span
                      className={
                        item.expiry_status === "expired"
                          ? "text-rose-600 dark:text-rose-400 font-medium"
                          : item.expiry_status === "soon"
                            ? "text-amber-600 dark:text-amber-400"
                            : ""
                      }
                    >
                      {item.expiry_label}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">سعر البيع</dt>
                <dd className="text-gray-900">{item.sale_price?.toFixed(2)} ج.م</dd>
              </div>
            <div className="flex justify-between items-center">
              <dt className="text-gray-500 dark:text-gray-400">الكمية الإجمالية</dt>
              <dd className="text-gray-900 dark:text-gray-100 font-bold">{item.total_quantity}</dd>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              الكمية تتغير فقط عبر فاتورة بيع أو شراء أو مرتجع
            </p>
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
              <dt className="text-gray-500 text-xs mb-2">الحد الأدنى (تنبيه نقص الكمية)</dt>
              <dd>
                <EditMinQuantity itemId={id} currentMin={item.min_quantity} />
              </dd>
            </div>
          </dl>
        </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">المخزون حسب المخزن</h2>
            {stockByWarehouse.length > 0 ? (
              <dl className="space-y-3 text-sm">
                {stockByWarehouse.map((s) => (
                  <div key={s.warehouse_name} className="flex justify-between">
                    <dt className="text-gray-500 dark:text-gray-400">{s.warehouse_name}</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{s.quantity} (محجوز: {s.reserved})</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-gray-500 text-sm">لا توجد بيانات مخزون</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">حركة المخزون (من أين جاء وإلى أين ذهب)</h2>
          </div>
          <div className="overflow-x-auto">
            {movements.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">التاريخ</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">النوع</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">الكمية</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">المخزن</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">المرجع</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{new Date(m.created_at).toLocaleDateString("ar-EG")}</td>
                      <td className="px-4 py-3 text-sm">{movementLabels[m.movement_type] || m.movement_type}</td>
                      <td className="px-4 py-3 text-sm">{m.quantity}</td>
                      <td className="px-4 py-3 text-sm">{m.warehouse_name || "—"}</td>
                      <td className="px-4 py-3 text-sm">{m.reference_type ? `${m.reference_type}: ${m.reference_id}` : "—"}</td>
                      <td className="px-4 py-3 text-sm">{m.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-gray-500">لا توجد حركات مخزون حتى الآن</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">سجل الفواتير</h2>
          </div>
          <div className="overflow-x-auto">
            {invoiceHistory.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">رقم الفاتورة</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">النوع</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">الكمية</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">السعر</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">الإجمالي</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceHistory.map((ii, idx) => (
                    <tr key={idx} className="border-b border-gray-50">
                      <td className="px-4 py-3 text-sm">{ii.invoice_number}</td>
                      <td className="px-4 py-3 text-sm">{ii.invoice_type}</td>
                      <td className="px-4 py-3 text-sm">{ii.quantity}</td>
                      <td className="px-4 py-3 text-sm">{ii.unit_price?.toFixed(2)} ج.م</td>
                      <td className="px-4 py-3 text-sm">{ii.total?.toFixed(2)} ج.م</td>
                      <td className="px-4 py-3 text-sm">{new Date(ii.created_at).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-gray-500">لم يُستخدم في فواتير حتى الآن</div>
            )}
          </div>
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
