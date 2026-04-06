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
    const name_ar = body.name_ar?.trim();
    if (!name_ar) {
      return NextResponse.json({ error: "اسم البند مطلوب" }, { status: 400 });
    }

    const id = randomUUID();
    const maxOrder = await db.execute({
      sql: "SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM inspection_checklist_items WHERE company_id IS NULL OR company_id = ?",
      args: [companyId],
    });
    const sort_order = Number(maxOrder.rows[0]?.next_order ?? 1);

    await db.execute({
      sql: "INSERT INTO inspection_checklist_items (id, company_id, name_ar, sort_order, is_active) VALUES (?, ?, ?, ?, 1)",
      args: [id, companyId, name_ar, sort_order],
    });

    return NextResponse.json({ id, name_ar, sort_order });
  } catch (error) {
    console.error("Checklist POST error:", error);
    return NextResponse.json({ error: "فشل في الإضافة" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await db.execute({
      sql: `SELECT id, name_ar, sort_order FROM inspection_checklist_items 
            WHERE (company_id IS NULL OR company_id = ?) AND is_active = 1 
            ORDER BY sort_order, name_ar`,
      args: [companyId],
    });

    const items = result.rows.map((r) => ({
      id: r.id,
      name_ar: r.name_ar,
      sort_order: r.sort_order ?? 0,
    }));

    return NextResponse.json(items);
  } catch (error) {
    console.error("Checklist GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
