import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const brandId = searchParams.get("brand_id")?.trim();
  const modelId = searchParams.get("model_id")?.trim();
  const year = searchParams.get("year")?.trim();
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10) || 50);
  let sql = "SELECT id, code, description_ar, description_en, source, search_count, vehicle_brand_id, vehicle_model_id, year_from, year_to, created_at FROM obd_codes WHERE 1=1";
  const args: (string | number)[] = [];
  if (q) {
    sql += " AND (UPPER(code) LIKE ? OR description_ar LIKE ? OR description_en LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  if (brandId) {
    sql += " AND vehicle_brand_id = ?";
    args.push(brandId);
  }
  if (modelId) {
    sql += " AND vehicle_model_id = ?";
    args.push(modelId);
  }
  if (year && /^\d{4}$/.test(year)) {
    const y = parseInt(year, 10);
    sql += " AND (year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?)";
    args.push(y, y);
  }
  sql += " ORDER BY code LIMIT ?";
  args.push(limit);
  const r = await db.execute({ sql, args });
  return NextResponse.json(
    r.rows.map((row) => ({
      id: row.id,
      code: row.code,
      description_ar: row.description_ar,
      description_en: row.description_en,
      source: row.source,
      search_count: row.search_count,
      vehicle_brand_id: row.vehicle_brand_id,
      vehicle_model_id: row.vehicle_model_id,
      year_from: row.year_from,
      year_to: row.year_to,
      created_at: row.created_at,
    }))
  );
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  if (session.user.role !== "super_admin") {
    return NextResponse.json({ error: "إضافة أكواد إلى قاعدة OBD — للمدير العام فقط" }, { status: 403 });
  }
  const body = await request.json();
  const code = body.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO obd_codes (id, company_id, code, description_ar, description_en, causes, solutions, symptoms, source, vehicle_brand_id, vehicle_model_id, year_from, year_to)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, ?, ?, ?)`,
    args: [
      id,
      companyId,
      code,
      body.description_ar?.trim() || null,
      body.description_en?.trim() || null,
      body.causes?.trim() || null,
      body.solutions?.trim() || null,
      body.symptoms?.trim() || null,
      body.vehicle_brand_id || null,
      body.vehicle_model_id || null,
      body.year_from ?? null,
      body.year_to ?? null,
    ],
  });
  return NextResponse.json({ id, code });
}
