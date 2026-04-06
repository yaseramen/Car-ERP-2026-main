import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { put } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";
import { bufferToCompressedWebp } from "@/lib/compress-image-webp";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_ROLES = ["super_admin", "tenant_owner"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "رفع الشعار غير مُعدّ على الخادم (BLOB_READ_WRITE_TOKEN)." },
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
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "حجم الصورة كبير (الحد 4 ميجا)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let webp: Buffer;
  try {
    webp = await bufferToCompressedWebp(buf, "logo");
  } catch {
    return NextResponse.json({ error: "تعذر معالجة الصورة — استخدم JPEG أو PNG" }, { status: 400 });
  }

  const pathname = `company-logos/${companyId}/${randomUUID()}.webp`;
  const blob = await put(pathname, webp, {
    access: "public",
    token,
    contentType: "image/webp",
  });

  await db.execute({
    sql: "UPDATE companies SET logo_url = ?, updated_at = datetime('now') WHERE id = ?",
    args: [blob.url, companyId],
  });

  return NextResponse.json({ ok: true, logo_url: blob.url });
}

export async function DELETE() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  await db.execute({
    sql: "UPDATE companies SET logo_url = NULL, updated_at = datetime('now') WHERE id = ?",
    args: [companyId],
  });

  return NextResponse.json({ ok: true });
}
