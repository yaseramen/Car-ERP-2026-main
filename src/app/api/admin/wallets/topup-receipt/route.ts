import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";
import { bufferToCompressedWebp } from "@/lib/compress-image-webp";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** رفع إيصال شحن المحفظة — مالك الشركة فقط */
export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "رفع الصور غير مُعدّ على الخادم (BLOB_READ_WRITE_TOKEN)." },
      { status: 503 }
    );
  }

  if (!session?.user || session.user.role !== "tenant_owner" || !companyId) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
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
    webp = await bufferToCompressedWebp(buf, "screenshot");
  } catch {
    return NextResponse.json({ error: "تعذر معالجة الصورة — استخدم JPEG أو PNG" }, { status: 400 });
  }

  const pathname = `wallet-topup/${companyId}/${randomUUID()}.webp`;
  const blob = await put(pathname, webp, {
    access: "public",
    token,
    contentType: "image/webp",
  });

  return NextResponse.json({ url: blob.url });
}
