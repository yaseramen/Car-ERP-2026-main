import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { randomUUID } from "crypto";
import { bufferToCompressedWebp } from "@/lib/compress-image-webp";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "رفع الصور غير مُعدّ على الخادم (BLOB_READ_WRITE_TOKEN). استخدم رابط صورة خارجي." },
      { status: 503 }
    );
  }

  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const isSuper = session.user.role === "super_admin";
  if (!isSuper && !companyId) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  if (!isSuper) {
    if (session.user.role === "employee") {
      const ok = await canAccess(session.user.id, "employee", companyId!, "marketplace", "create");
      if (!ok) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    if (session.user.companyBusinessType !== "supplier") {
      return NextResponse.json({ error: "غير مسموح" }, { status: 403 });
    }
    if (!session.user.companyMarketplaceEnabled) {
      return NextResponse.json({ error: "السوق غير مفعّل لشركتك" }, { status: 403 });
    }
    if (session.user.companyAdsGloballyDisabled) {
      return NextResponse.json({ error: "تم إيقاف إعلانات شركتك" }, { status: 403 });
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ملف الصورة مطلوب (file)" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "حجم الصورة كبير جداً (الحد 8 ميجا)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let webp: Buffer;
  try {
    webp = await bufferToCompressedWebp(buf, "marketplace");
  } catch {
    return NextResponse.json({ error: "تعذر معالجة الصورة — استخدم JPEG أو PNG" }, { status: 400 });
  }

  const prefix = isSuper ? `marketplace/super/${randomUUID()}` : `marketplace/${companyId}/${randomUUID()}`;
  const pathname = `${prefix}.webp`;

  const blob = await put(pathname, webp, {
    access: "public",
    token,
    contentType: "image/webp",
  });

  return NextResponse.json({ url: blob.url, image_blob_url: blob.url });
}
