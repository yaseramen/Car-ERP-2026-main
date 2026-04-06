import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { DEVELOPER_INFO } from "@/lib/invoice-config";
import { AddPayment } from "./add-payment";
import { InvoiceActions } from "./invoice-actions";
import { PartialReturnButton } from "./partial-return-button";
import { ReturnButton } from "./return-button";
import { CancelButton } from "./cancel-button";
import { EditPurchaseInvoice } from "./edit-purchase-invoice";
import { InvoicePaymentsList } from "./invoice-payments-list";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  const companyId = getCompanyId(session);
  if (!companyId) redirect("/login");

  const { id } = await params;

  try {
    const invResult = await db.execute({
      sql: `SELECT inv.*,
            comp.name as company_name, comp.phone as company_phone, comp.address as company_address,
            comp.logo_url as company_logo_url,
            comp.tax_number as company_tax_number, comp.commercial_registration as company_commercial_registration,
            c.name as customer_name, c.phone as customer_phone,
            s.name as supplier_name, s.phone as supplier_phone,
            ro.order_number, ro.vehicle_plate, ro.vehicle_model, ro.inspection_notes as repair_order_inspection_notes,
            u.name as created_by_name, u.email as created_by_email,
            wh.name as warehouse_name
            FROM invoices inv
            LEFT JOIN companies comp ON inv.company_id = comp.id
            LEFT JOIN customers c ON inv.customer_id = c.id
            LEFT JOIN suppliers s ON inv.supplier_id = s.id
            LEFT JOIN repair_orders ro ON inv.repair_order_id = ro.id
            LEFT JOIN users u ON inv.created_by = u.id
            LEFT JOIN warehouses wh ON inv.warehouse_id = wh.id
            WHERE inv.id = ? AND inv.company_id = ?`,
      args: [id, companyId],
    });

    if (invResult.rows.length === 0) notFound();

    const row = invResult.rows[0];
    const data = {
      id: String(row.id ?? ""),
      invoice_number: String(row.invoice_number ?? ""),
      type: String(row.type ?? ""),
      status: String(row.status ?? ""),
      is_return: Number(row.is_return ?? 0) === 1,
      original_invoice_id: row.original_invoice_id ? String(row.original_invoice_id) : null,
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      tax: Number(row.tax ?? 0),
      digital_service_fee: Number(row.digital_service_fee ?? 0),
      total: Number(row.total ?? 0),
      paid_amount: Number(row.paid_amount ?? 0),
      company_name: row.company_name ? String(row.company_name) : null,
      company_phone: row.company_phone ? String(row.company_phone) : null,
      company_address: row.company_address ? String(row.company_address) : null,
      company_tax_number: row.company_tax_number ? String(row.company_tax_number) : null,
      company_commercial_registration: row.company_commercial_registration ? String(row.company_commercial_registration) : null,
      company_logo_url: row.company_logo_url ? String(row.company_logo_url) : null,
      customer_name: row.customer_name ? String(row.customer_name) : null,
      customer_phone: row.customer_phone ? String(row.customer_phone) : null,
      supplier_id: row.supplier_id ? String(row.supplier_id) : null,
      supplier_name: row.supplier_name ? String(row.supplier_name) : null,
      supplier_phone: row.supplier_phone ? String(row.supplier_phone) : null,
      order_number: row.order_number ? String(row.order_number) : null,
      vehicle_plate: row.vehicle_plate ? String(row.vehicle_plate) : null,
      vehicle_model: row.vehicle_model ? String(row.vehicle_model) : null,
      repair_order_id: row.repair_order_id ? String(row.repair_order_id) : null,
      repair_order_inspection_notes: row.repair_order_inspection_notes
        ? String(row.repair_order_inspection_notes)
        : null,
      notes: row.notes ? String(row.notes) : null,
      created_at: String(row.created_at ?? ""),
      created_by_name: row.created_by_name ? String(row.created_by_name) : null,
      created_by_email: row.created_by_email ? String(row.created_by_email) : null,
      /** للعرض: الاسم أولاً؛ إن لم يُعرَّف يُعرض البريد (مفيد للطباعة الضيقة) */
      created_by_display: (() => {
        const n = row.created_by_name != null ? String(row.created_by_name).trim() : "";
        const e = row.created_by_email != null ? String(row.created_by_email).trim() : "";
        return n || e || null;
      })(),
      warehouse_name: row.warehouse_name ? String(row.warehouse_name) : null,
    };

    const itemsResult = await db.execute({
      sql: `SELECT ii.*, i.name as item_name, i.unit as item_unit, i.sale_price as item_sale_price
            FROM invoice_items ii
            LEFT JOIN items i ON ii.item_id = i.id
            WHERE ii.invoice_id = ?
            ORDER BY ii.sort_order, ii.created_at`,
      args: [id],
    });

    const items = itemsResult.rows.map((r) => ({
      id: String(r.id ?? ""),
      item_id: r.item_id ? String(r.item_id) : null,
      item_name: r.item_name ? String(r.item_name) : (r.description ? String(r.description) : "صنف"),
      quantity: Number(r.quantity ?? 0),
      unit_price: Number(r.unit_price ?? 0),
      total: Number(r.total ?? 0),
      item_sale_price: Number(r.item_sale_price ?? 0),
    }));

    const paymentsResult = await db.execute({
      sql: `SELECT ip.*, pm.name as method_name FROM invoice_payments ip
            JOIN payment_methods pm ON ip.payment_method_id = pm.id
            WHERE ip.invoice_id = ? ORDER BY ip.created_at`,
      args: [id],
    });

    const payments = paymentsResult.rows.map((r) => ({
      id: String(r.id ?? ""),
      amount: Number(r.amount ?? 0),
      method_name: String(r.method_name ?? ""),
      reference_number: r.reference_number ? String(r.reference_number) : null,
      reference_from: r.reference_from ? String(r.reference_from) : null,
      reference_to: r.reference_to ? String(r.reference_to) : null,
      created_at: String(r.created_at ?? ""),
    }));

    const TYPE_LABELS: Record<string, string> = {
      sale: "بيع",
      purchase: "شراء",
      maintenance: "صيانة",
    };

    const STATUS_LABELS: Record<string, string> = {
      draft: "مسودة",
      pending: "معلقة",
      paid: "مدفوعة",
      partial: "مدفوعة جزئياً",
      returned: "مرتجع",
      cancelled: "ملغاة",
    };

    const issuedAt = new Date(data.created_at);
    const issuedAtInvalid = Number.isNaN(issuedAt.getTime());
    const issuedAtDisplay = issuedAtInvalid
      ? data.created_at
      : issuedAt.toLocaleString("ar-EG", { dateStyle: "long", timeStyle: "short" });

    const lineCount = items.length;
    /** تقدير: فواتير طويلة قد تمتد لأكثر من صفحة — نعرض تلميح «تابع» في الطباعة */
    const likelyMultiPagePrint = lineCount >= 14;

    return (
    <div className="p-4 md:p-8 print:p-0 invoice-detail-shell">
      <div className="mb-6 flex justify-between items-center flex-wrap gap-2">
        <Link
          href="/admin/invoices"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 no-print"
        >
          ← العودة للفواتير
        </Link>
        <div className="flex gap-2 no-print items-center flex-wrap">
          {data.type === "purchase" && (
            <EditPurchaseInvoice
              invoiceId={id}
              canEdit={
                data.status === "pending" &&
                data.paid_amount <= 0 &&
                !data.is_return
              }
              blockReason={
                data.paid_amount > 0
                  ? "لا يمكن التعديل طالما وُجدت دفعات. انزل إلى «سجل المدفوعات» واضغط «حذف الدفعة» لكل دفعة (يُعاد المبلغ للخزينة)، ثم يظهر زر التعديل."
                  : data.status !== "pending"
                    ? "التعديل متاح لفاتورة الشراء في حالة «معلقة» فقط (بدون مدفوعات مسجّلة)."
                    : null
              }
              initialSupplierId={data.supplier_id}
              initialNotes={data.notes}
              initialDiscount={data.discount}
              initialTax={data.tax}
              lines={items.filter((it): it is typeof it & { item_id: string } => Boolean(it.item_id)).map((it) => ({
                id: it.id,
                item_id: it.item_id!,
                item_name: it.item_name,
                quantity: it.quantity,
                unit_price: it.unit_price,
                sale_price: it.item_sale_price,
              }))}
            />
          )}
          <PartialReturnButton invoiceId={id} type={data.type} status={data.status} items={items} />
          <ReturnButton invoiceId={id} type={data.type} status={data.status} />
          <CancelButton invoiceId={id} type={data.type} status={data.status} />
          <InvoiceActions
            invoiceNumber={data.invoice_number}
            invoiceType={data.type}
            total={data.total}
            subtotal={data.subtotal}
            discount={data.discount}
            tax={data.tax}
            companyName={data.company_name}
            customerName={data.customer_name}
            supplierName={data.supplier_name}
            issuedByName={data.created_by_name}
            issuedByEmail={data.created_by_email}
            warehouseName={data.warehouse_name}
            createdAt={data.created_at}
            items={items}
            repairOrderNumber={data.order_number}
            repairOrderInspectionNotes={data.repair_order_inspection_notes}
          />
        </div>
      </div>

      <div
        id="invoice-print-area"
        className={`relative ${likelyMultiPagePrint ? "invoice-print-long-doc" : ""}`}
      >
      <div className="relative z-[1] invoice-print-content-layer">
      {likelyMultiPagePrint && (
        <p
          className="hidden print:block text-center text-[10px] text-gray-500 mb-1 invoice-print-continuation-banner"
          aria-hidden
        >
          — تابع — قد تمتد البنود على أكثر من صفحة؛ جميع الصفحات لنفس الفاتورة رقم {data.invoice_number}
        </p>
      )}
      {data.company_name && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 invoice-print-compact">
          <div className="flex flex-wrap items-start gap-3">
            {data.company_logo_url && (
              <div
                className="shrink-0 flex items-center justify-center invoice-print-company-logo-wrap"
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.company_logo_url}
                  alt=""
                  className="max-h-16 max-w-[100px] sm:max-w-[120px] w-auto object-contain object-center opacity-90 invoice-print-company-logo"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-3 text-lg">بيانات الشركة</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">اسم الشركة</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{data.company_name}</dd>
            </div>
            {data.company_phone && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">رقم الهاتف</dt>
                <dd className="text-gray-900 dark:text-gray-100">{data.company_phone}</dd>
              </div>
            )}
            {data.company_address && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500 dark:text-gray-400">العنوان</dt>
                <dd className="text-gray-900 dark:text-gray-100 invoice-print-address-one-line">
                  {data.company_address}
                </dd>
              </div>
            )}
            {data.company_tax_number && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">رقم البطاقة الضريبية</dt>
                <dd className="text-gray-900 dark:text-gray-100">{data.company_tax_number}</dd>
              </div>
            )}
            {data.company_commercial_registration && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">رقم السجل التجاري</dt>
                <dd className="text-gray-900 dark:text-gray-100">{data.company_commercial_registration}</dd>
              </div>
            )}
              </dl>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 invoice-print-compact invoice-print-title-block">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between print:flex-row print:justify-between print:items-baseline print:gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 m-0 shrink-0">
            فاتورة {data.invoice_number}
          </h1>
          <p className="text-sm text-gray-800 dark:text-gray-200 m-0 font-medium print:text-gray-900 sm:text-left print:text-left">
            تاريخ ووقت الإصدار: {issuedAtDisplay}
          </p>
        </div>
        {data.is_return && (
          <p className="text-gray-500 dark:text-gray-400 mt-2 mb-0">
            <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded text-sm font-medium">
              مرتجع
            </span>
          </p>
        )}
        {data.is_return && data.original_invoice_id && (
          <Link
            href={`/admin/invoices/${data.original_invoice_id}`}
            className="text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 no-print inline-block mt-2"
          >
            ← عرض الفاتورة الأصلية
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 invoice-print-grid invoice-print-meta-grid">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 invoice-print-card">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">بيانات الفاتورة</h2>
          <dl className="space-y-3 text-sm invoice-print-dl-tight">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500 dark:text-gray-400 shrink-0">النوع والحالة</dt>
              <dd className="text-gray-900 dark:text-gray-100 text-left">
                {TYPE_LABELS[data.type] || data.type} — {STATUS_LABELS[data.status] || data.status}
              </dd>
            </div>
            {data.created_by_display && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-gray-400 shrink-0">أصدرها</dt>
                <dd
                  className="text-gray-900 dark:text-gray-100 text-left break-words invoice-print-issuer-line"
                  title={
                    data.created_by_name?.trim() && data.created_by_email
                      ? data.created_by_email
                      : undefined
                  }
                >
                  {data.created_by_display}
                </dd>
              </div>
            )}
            {data.type === "sale" && data.warehouse_name && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500 dark:text-gray-400 shrink-0">المخزن</dt>
                <dd className="text-gray-900 dark:text-gray-100 text-right">{data.warehouse_name}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 invoice-print-card">
          {data.type === "purchase" ? (
            <>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">المورد</h2>
              <dl className="space-y-3 text-sm invoice-print-dl-tight">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">اسم المورد</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.supplier_name || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">هاتف المورد</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.supplier_phone || "—"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-4">العميل / السيارة</h2>
              <dl className="space-y-3 text-sm invoice-print-dl-tight">
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">العميل</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.customer_name || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">الهاتف</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.customer_phone || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">رقم اللوحة</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.vehicle_plate || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500 dark:text-gray-400">الموديل</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{data.vehicle_model || "—"}</dd>
                </div>
                {data.repair_order_id && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-500 dark:text-gray-400 shrink-0">أمر الإصلاح</dt>
                    <dd className="text-left">
                      <Link
                        href={`/admin/workshop/${data.repair_order_id}`}
                        className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 no-print"
                      >
                        {data.order_number || "عرض"}
                      </Link>
                      <span className="hidden print:inline text-gray-900 dark:text-gray-100">
                        {data.order_number || "—"}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-8 invoice-print-card">
        <div className="overflow-x-auto invoice-print-items-wrap">
          {items.length > 0 ? (
            <table className="w-full invoice-lines-table">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th
                    colSpan={4}
                    className="text-right px-4 py-2 text-base font-bold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-700"
                  >
                    بنود الفاتورة
                    {lineCount > 0 && (
                      <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-1 print:inline print:mr-2 print:mt-0">
                        ({lineCount} بند)
                      </span>
                    )}
                  </th>
                </tr>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 invoice-print-item-name">
                    الصنف
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 invoice-print-qty-col w-14 min-w-[3.25rem]">
                    عدد
                  </th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">سعر الوحدة</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 invoice-print-item-name">
                      {item.item_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 invoice-print-qty-col w-14 min-w-[3.25rem] text-center tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap invoice-print-money">
                      {item.unit_price?.toFixed(2)} ج.م
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap invoice-print-money">
                      {item.total?.toFixed(2)} ج.م
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <td colSpan={3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">المجموع الفرعي</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap invoice-print-money">
                    {data.subtotal?.toFixed(2)} ج.م
                  </td>
                </tr>
                {data.discount > 0 && (
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <td colSpan={3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">الخصم</td>
                    <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 whitespace-nowrap invoice-print-money">
                      -{data.discount?.toFixed(2)} ج.م
                    </td>
                  </tr>
                )}
                {data.tax > 0 && (
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <td colSpan={3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">الضريبة</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap invoice-print-money">
                      +{data.tax?.toFixed(2)} ج.م
                    </td>
                  </tr>
                )}
                {data.digital_service_fee > 0 && (
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <td colSpan={3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">الخدمة الرقمية</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap invoice-print-money">
                      {data.digital_service_fee?.toFixed(2)} ج.م
                    </td>
                  </tr>
                )}
                <tr className="bg-emerald-50 dark:bg-emerald-900/30 font-bold">
                  <td colSpan={3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">الإجمالي النهائي</td>
                  <td className="px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 whitespace-nowrap invoice-print-money">
                    {data.total?.toFixed(2)} ج.م
                  </td>
                </tr>
                {data.paid_amount > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">المدفوع</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap invoice-print-money">
                      {data.paid_amount?.toFixed(2)} ج.م
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">لا توجد بنود</div>
          )}
        </div>
      </div>

      {data.repair_order_id &&
        data.repair_order_inspection_notes &&
        data.repair_order_inspection_notes.trim() && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 shadow-sm border border-amber-200 dark:border-amber-800 mb-8 invoice-print-card invoice-print-notes">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2">ملاحظات الفحص (مرجع ورشة)</h2>
            <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
              {data.repair_order_inspection_notes.trim()}
            </p>
            {data.order_number && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 print:text-gray-600">
                مرتبط بأمر الإصلاح: {data.order_number}
              </p>
            )}
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 invoice-print-payments-row">
        <div className="no-print">
          <AddPayment
            invoiceId={id}
            total={data.total}
            paidAmount={data.paid_amount}
            status={data.status}
            invoiceType={data.type}
            defaultReferenceFrom={data.customer_phone || data.supplier_phone || null}
          />
        </div>
        {/* الشاشة: قائمة تفاعلية. الطباعة: ملخص نصي فقط (بدون أزرار/تعليمات) لتجنب صفحة ثانية فارغة */}
        <div
          className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden invoice-print-payments-card ${payments.length === 0 ? "no-print" : ""}`}
        >
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-gray-100">سجل المدفوعات</h2>
          </div>
          <div className="p-4">
            <div className="no-print">
              <InvoicePaymentsList
                invoiceId={id}
                invoiceType={data.type}
                status={data.status}
                payments={payments}
              />
            </div>
            {payments.length > 0 && (
              <ul className="hidden print:block space-y-1 text-sm text-gray-900 dark:text-gray-100 list-none p-0 m-0">
                {payments.map((p) => (
                  <li key={p.id}>
                    {p.method_name} — {new Date(p.created_at).toLocaleString("ar-EG")} — +
                    {p.amount.toFixed(2)} ج.م
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {data.notes && data.notes.trim() && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 invoice-print-notes">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2">ملاحظات</h2>
          <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400 invoice-print-footer">
        <p className="font-medium text-gray-600 dark:text-gray-400">برمجة وتطوير البرنامج</p>
        <p className="mt-1">{DEVELOPER_INFO.name}</p>
        <p>هاتف: {DEVELOPER_INFO.phone}</p>
        {DEVELOPER_INFO.email && <p>البريد: {DEVELOPER_INFO.email}</p>}
      </div>

      {likelyMultiPagePrint && (
        <div className="hidden print:block invoice-print-fixed-footer" aria-hidden>
          <div className="invoice-print-fixed-footer-inner">
            <span className="font-medium">فاتورة {data.invoice_number}</span>
            <span className="block text-[9px] mt-0.5 opacity-90">
              — تابع — راجع الصفحات التالية؛ البنود قد تمتد على أكثر من صفحة
            </span>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
    );
  } catch {
    notFound();
  }
}
