"use client";

import { useCallback, useState } from "react";

type InvoiceItem = {
  item_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type InvoiceActionsProps = {
  invoiceNumber: string;
  invoiceType: string;
  total: number;
  subtotal?: number;
  discount?: number;
  tax?: number;
  companyName?: string | null;
  customerName?: string | null;
  supplierName?: string | null;
  /** من أصدر الفاتورة (للطباعة وواتساب) */
  issuedByName?: string | null;
  issuedByEmail?: string | null;
  /** مخزن صرف البضاعة (بيع / توزيع) */
  warehouseName?: string | null;
  /** وقت إصدار الفاتورة (ISO) — للواتساب */
  createdAt?: string;
  items?: InvoiceItem[];
  /** من أمر الإصلاح المرتبط — للواتساب */
  repairOrderNumber?: string | null;
  repairOrderInspectionNotes?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  sale: "بيع",
  purchase: "شراء",
  maintenance: "صيانة",
};

function buildWhatsAppText(props: InvoiceActionsProps): string {
  const {
    invoiceNumber,
    invoiceType,
    total,
    subtotal = 0,
    discount = 0,
    tax = 0,
    companyName,
    customerName,
    supplierName,
    issuedByName,
    issuedByEmail,
    warehouseName,
    createdAt,
    items = [],
    repairOrderNumber,
    repairOrderInspectionNotes,
  } = props;
  const typeLabel = TYPE_LABELS[invoiceType] || invoiceType;
  const issuedAtLine = (() => {
    if (!createdAt) return null;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return `🕐 الإصدار: ${createdAt}`;
    return `🕐 الإصدار: ${d.toLocaleString("ar-EG", { dateStyle: "long", timeStyle: "short" })}`;
  })();
  const issuerLine =
    issuedByName || issuedByEmail
      ? `👤 أصدرها: ${issuedByName || issuedByEmail}${issuedByName && issuedByEmail ? ` (${issuedByEmail})` : ""}`
      : null;
  const warehouseLine =
    invoiceType === "sale" && warehouseName ? `📦 المخزن: ${warehouseName}` : null;

  const lines: string[] = [
    `📄 فاتورة ${typeLabel} رقم ${invoiceNumber}`,
    companyName ? `🏢 ${companyName}` : null,
    customerName ? `👤 العميل: ${customerName}` : supplierName ? `🏭 المورد: ${supplierName}` : null,
    warehouseLine,
    issuedAtLine,
    issuerLine,
    "",
    "── البنود ──",
  ].filter(Boolean) as string[];

  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.item_name} | ${it.quantity} × ${it.unit_price.toFixed(2)} = ${it.total.toFixed(2)} ج.م`);
  });

  lines.push(
    "",
    "── الإجماليات ──",
    `المجموع الفرعي: ${subtotal.toFixed(2)} ج.م`,
  );
  if (discount > 0) lines.push(`الخصم: -${discount.toFixed(2)} ج.م`);
  if (tax > 0) lines.push(`الضريبة: +${tax.toFixed(2)} ج.م`);
  lines.push(`الإجمالي النهائي: ${total.toFixed(2)} ج.م`);

  const inspection = repairOrderInspectionNotes?.trim();
  if (inspection) {
    lines.push("", "── ملاحظات الفحص (مرجع ورشة) ──");
    if (repairOrderNumber) lines.push(`🔧 أمر الإصلاح: ${repairOrderNumber}`);
    lines.push(inspection);
  }

  return lines.join("\n");
}

export function InvoiceActions(props: InvoiceActionsProps) {
  const { invoiceNumber, invoiceType, total, items = [] } = props;
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    const el = document.getElementById("invoice-print-area");
    if (!el) return;

    setPdfLoading(true);
    const noPrint = el.querySelectorAll(".no-print");
    noPrint.forEach((n) => ((n as HTMLElement).style.visibility = "hidden"));

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `فاتورة-${invoiceNumber}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } finally {
      noPrint.forEach((n) => ((n as HTMLElement).style.visibility = ""));
      setPdfLoading(false);
    }
  }, [invoiceNumber]);

  const handleShareWhatsApp = useCallback(() => {
    const text = buildWhatsAppText(props);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [props]);

  const handleShareWhatsAppPdf = useCallback(async () => {
    const el = document.getElementById("invoice-print-area");
    if (!el) return;

    setPdfLoading(true);
    const noPrint = el.querySelectorAll(".no-print");
    noPrint.forEach((n) => ((n as HTMLElement).style.visibility = "hidden"));

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const blob = await html2pdf()
        .set({
          margin: 10,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .outputPdf("blob");

      noPrint.forEach((n) => ((n as HTMLElement).style.visibility = ""));

      const file = new File([blob], `فاتورة-${invoiceNumber}.pdf`, { type: "application/pdf" });
      const text = buildWhatsAppText(props);

      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text,
          title: `فاتورة ${invoiceNumber}`,
        });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `فاتورة-${invoiceNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
        const url = `https://wa.me/?text=${encodeURIComponent(text + "\n\n📎 تم تحميل ملف PDF. يمكنك إرفاقه يدوياً.")}`;
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      const text = buildWhatsAppText(props);
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      noPrint.forEach((n) => ((n as HTMLElement).style.visibility = ""));
      setPdfLoading(false);
    }
  }, [invoiceNumber, props]);

  return (
    <div className="flex flex-wrap gap-2 no-print">
      <button
        type="button"
        onClick={handlePrint}
        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg transition-colors"
      >
        طباعة
      </button>
      <button
        type="button"
        onClick={handleDownloadPdf}
        disabled={pdfLoading}
        className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/70 text-emerald-800 dark:text-emerald-200 font-medium rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {pdfLoading ? "جاري التحميل..." : "تحميل PDF"}
      </button>
      <button
        type="button"
        onClick={handleShareWhatsApp}
        className="px-4 py-2 bg-green-100 dark:bg-green-900/50 hover:bg-green-200 dark:hover:bg-green-800/70 text-green-800 dark:text-green-200 font-medium rounded-lg transition-colors flex items-center gap-2"
      >
        <span>إرسال واتساب</span>
      </button>
      <button
        type="button"
        onClick={handleShareWhatsAppPdf}
        disabled={pdfLoading}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <span>{pdfLoading ? "جاري التحضير..." : "إرسال واتساب (PDF)"}</span>
      </button>
    </div>
  );
}
