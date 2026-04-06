import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";
import { bufferToCompressedWebp } from "@/lib/compress-image-webp";

const MAX_BYTES = 3 * 1024 * 1024;

/** رفع لقطة شاشة مرفقة بملاحظة للمطور — أي مستخدم مسجّل له شركة */
export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user?.id || !companyId) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (!["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "رفع الصور غير مُعدّ (BLOB_READ_WRITE_TOKEN). أرسل الملاحظة دون لقطة أو أرفق رابطاً في النص." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ملف الصورة مطلوب" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "حجم الصورة كبير (الحد 3 ميجا)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let webp: Buffer;
  try {
    webp = await bufferToCompressedWebp(buf, "screenshot");
  } catch {
    return NextResponse.json({ error: "تعذر معالجة الصورة" }, { status: 400 });
  }

  const pathname = `feedback-screenshots/${companyId}/${randomUUID()}.webp`;
  const blob = await put(pathname, webp, {
    access: "public",
    token,
    contentType: "image/webp",
  });

  return NextResponse.json({ url: blob.url });
}
