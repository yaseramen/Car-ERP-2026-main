"use client";

import { useEffect, useRef, useState } from "react";

interface BarcodeScannerProps {
  onScan: (value: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const startScan = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("barcode-reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText: string) => {
            onScan(decodedText);
            scanner.stop();
            onClose();
          },
          () => {}
        );
      } catch (err) {
        setError("تعذر الوصول للكاميرا. تأكد من السماح بالوصول.");
      }
    };

    startScan();
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div id="barcode-reader" className="rounded-lg overflow-hidden bg-black" />
        {error && (
          <p className="text-red-400 text-sm mt-4 text-center">{error}</p>
        )}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
