import { NextResponse } from "next/server";

/**
 * Digital Asset Links لـ Trusted Web Activity (TWA) / تطبيق أندرويد من الموقع.
 *
 * عيّن في Vercel (أو .env):
 *   ANDROID_TWA_PACKAGE_NAME=com.example.yourapp   (applicationId من Bubblewrap)
 *   ANDROID_TWA_SHA256_FINGERPRINTS=AA:BB:CC:...   (بصمة شهادة التوقيع؛ عدة قيم مفصولة بفاصلة أو سطر)
 *
 * حتى لا تُعرَّف المتغيرات: يُرجَع [] (ملف صالح؛ أضف القيم بعد أول build موقّع).
 */
function normalizeFingerprint(s: string): string {
  const t = s.trim().replace(/\s+/g, "").toUpperCase();
  if (t.includes(":")) return t;
  if (t.length !== 64 || !/^[0-9A-F]+$/i.test(t)) return s.trim();
  return t.match(/.{1,2}/g)?.join(":") ?? s.trim();
}

export async function GET() {
  const packageName = process.env.ANDROID_TWA_PACKAGE_NAME?.trim();
  const raw = process.env.ANDROID_TWA_SHA256_FINGERPRINTS?.trim();

  if (!packageName || !raw) {
    return NextResponse.json([], {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  const fingerprints = raw
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map(normalizeFingerprint);

  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
