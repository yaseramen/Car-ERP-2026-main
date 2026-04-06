import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, type } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: "اسم المخزن مطلوب" }, { status: 400 });
    }
    const whType = type === "distribution" ? "distribution" : "main";
    const id = randomUUID();
    await db.execute({
      sql: "INSERT INTO warehouses (id, company_id, name, type, is_active) VALUES (?, ?, ?, ?, 1)",
      args: [id, companyId, name.trim(), whType],
    });
    return NextResponse.json({ id, name: name.trim(), type: whType });
  } catch (error) {
    console.error("Warehouse create error:", error);
    return NextResponse.json({ error: "فشل في إضافة المخزن" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("all") === "1" || searchParams.get("include_inactive") === "1";

    const sql = includeInactive
      ? "SELECT id, name, type, location, is_active FROM warehouses WHERE company_id = ? ORDER BY is_active DESC, name"
      : "SELECT id, name, type, location, is_active FROM warehouses WHERE company_id = ? AND is_active = 1 ORDER BY name";
    const result = await db.execute({ sql, args: [companyId] });

    const warehouses = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      location: r.location ? String(r.location) : null,
      is_active: Number(r.is_active ?? 1) === 1,
    }));

    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("Warehouses GET error:", error);
    return NextResponse.json({ error: "فشل في جلب المخازن" }, { status: 500 });
  }
}
