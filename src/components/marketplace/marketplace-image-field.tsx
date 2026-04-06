"use client";

import { useRef, useState, type ChangeEvent } from "react";

type Props = {
  imageUrl: string;
  imageBlobUrl: string;
  onChange: (next: { imageUrl: string; imageBlobUrl: string }) => void;
  inputClass: string;
  labelClass?: string;
};

/**
 * رفع صورة إعلان السوق (ضغط على الخادم) أو لصق رابط خارجي.
 * يدعم الكاميرا والمعرض عبر input منفصلين لتوافق أفضل مع الجوال.
 */
export function MarketplaceImageField({ imageUrl, imageBlobUrl, onChange, inputClass, labelClass }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("اختر ملف صورة");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/marketplace/image", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError(typeof d.error === "string" ? d.error : "فشل الرفع");
        return;
      }
      const url = String(d.url ?? "");
      if (!url) {
        setUploadError("استجابة غير صالحة");
        return;
      }
      onChange({ imageUrl: url, imageBlobUrl: url });
    } catch {
      setUploadError("تعذر الرفع — تحقق من الاتصال");
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void uploadFile(f);
  }

  return (
    <div className="md:col-span-2 space-y-2">
      <label className={labelClass ?? "block text-xs text-gray-500 mb-1"}>صورة الإعلان</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => cameraRef.current?.click()}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50"
        >
          {uploading ? "جاري الرفع…" : "📷 كاميرا"}
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => galleryRef.current?.click()}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50"
        >
          معرض الصور
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        تُضغط الصورة على الخادم وتُخزَّن كرابط (أخف على قاعدة البيانات). عند انتهاء أو إلغاء الإعلان تُحذف من التخزين تلقائياً.
      </p>
      {uploadError && <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>}
      <div>
        <label className="block text-xs text-gray-500 mb-1">أو رابط صورة (URL)</label>
        <input
          value={imageUrl}
          onChange={(e) =>
            onChange({
              imageUrl: e.target.value,
              imageBlobUrl: "",
            })
          }
          className={inputClass}
          dir="ltr"
          placeholder="https://..."
        />
      </div>
      {(imageUrl || imageBlobUrl) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {imageUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="h-20 w-auto max-w-full rounded border border-gray-200 dark:border-gray-600 object-cover" />
            </>
          )}
          {imageBlobUrl && imageBlobUrl === imageUrl && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">مرفوعة — تُحذف تلقائياً مع الإعلان</span>
          )}
          <button
            type="button"
            onClick={() => onChange({ imageUrl: "", imageBlobUrl: "" })}
            className="text-xs text-red-600 dark:text-red-400 underline"
          >
            إزالة الصورة
          </button>
        </div>
      )}
    </div>
  );
}
