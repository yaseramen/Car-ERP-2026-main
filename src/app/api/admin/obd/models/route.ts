import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brand_id");
  let sql = "SELECT m.id, m.brand_id, m.name_ar, m.name_en, m.year_from, m.year_to, b.name_ar as brand_name FROM vehicle_models m LEFT JOIN vehicle_brands b ON m.brand_id = b.id";
  const args: string[] = [];
  if (brandId) {
    sql += " WHERE m.brand_id = ?";
    args.push(brandId);
  }
  sql += " ORDER BY b.name_ar, m.name_ar";
  const r = await db.execute({ sql, args });
  return NextResponse.json(
    r.rows.map((row) => ({
      id: row.id,
      brand_id: row.brand_id,
      name_ar: row.name_ar,
      name_en: row.name_en,
      year_from: row.year_from,
      year_to: row.year_to,
      brand_name: row.brand_name,
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
  const brand_id = body.brand_id?.trim();
  if (!name_ar) return NextResponse.json({ error: "الاسم بالعربية مطلوب" }, { status: 400 });
  if (!brand_id) return NextResponse.json({ error: "الماركة مطلوبة" }, { status: 400 });
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO vehicle_models (id, brand_id, name_ar, name_en, year_from, year_to) VALUES (?, ?, ?, ?, ?, ?)",
    args: [
      id,
      brand_id,
      name_ar,
      body.name_en?.trim() || null,
      body.year_from ?? null,
      body.year_to ?? null,
    ],
  });
  return NextResponse.json({ id, brand_id, name_ar, name_en: body.name_en?.trim() || null, year_from: body.year_from, year_to: body.year_to });
}
