import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const r = await db.execute({
    sql: "SELECT id, name_ar, name_en, is_active, created_at FROM vehicle_brands ORDER BY name_ar",
  });
  return NextResponse.json(
    r.rows.map((row) => ({
      id: row.id,
      name_ar: row.name_ar,
      name_en: row.name_en,
      is_active: row.is_active,
      created_at: row.created_at,
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const body = await request.json();
  const name_ar = body.name_ar?.trim();
  if (!name_ar) return NextResponse.json({ error: "الاسم بالعربية مطلوب" }, { status: 400 });
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO vehicle_brands (id, name_ar, name_en) VALUES (?, ?, ?)",
    args: [id, name_ar, body.name_en?.trim() || null],
  });
  return NextResponse.json({ id, name_ar, name_en: body.name_en?.trim() || null });
}
