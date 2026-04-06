"use client";

import { useState } from "react";
import { BarcodeLabelPrint } from "@/components/inventory/barcode-label-print";

export function PrintBarcodeButton({
  barcode,
  itemName,
  salePrice,
  hasExpiry,
  expiryDate,
}: {
  barcode: string;
  itemName: string;
  salePrice?: number;
  hasExpiry?: boolean;
  expiryDate?: string | null;
}) {
  const [showPrint, setShowPrint] = useState(false);

  if (!barcode?.trim()) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPrint(true)}
        className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/70 text-emerald-800 dark:text-emerald-200 font-medium rounded-lg transition text-sm"
      >
        طباعة ملصق الباركود
      </button>
      {showPrint && (
        <BarcodeLabelPrint
          barcode={barcode}
          itemName={itemName}
          salePrice={salePrice}
          hasExpiry={hasExpiry}
          expiryDate={expiryDate}
          onClose={() => setShowPrint(false)}
        />
      )}
    </>
  );
}
