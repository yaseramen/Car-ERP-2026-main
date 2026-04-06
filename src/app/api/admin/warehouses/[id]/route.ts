import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, type, location, is_active } = body;

    const existing = await db.execute({
      sql: "SELECT id FROM warehouses WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "المخزن غير موجود" }, { status: 404 });
    }

    const updates: string[] = [];
    const args: (string | number | null)[] = [];

    if (name !== undefined && name?.trim()) {
      updates.push("name = ?");
      args.push(name.trim());
    }
    if (type !== undefined) {
      const whType = type === "distribution" ? "distribution" : "main";
      updates.push("type = ?");
      args.push(whType);
    }
    if (location !== undefined) {
      updates.push("location = ?");
      args.push(location?.trim() || null);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      args.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    updates.push("updated_at = datetime('now')");
    args.push(id, companyId);

    await db.execute({
      sql: `UPDATE warehouses SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`,
      args,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Warehouse update error:", error);
    return NextResponse.json({ error: "فشل في التحديث" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const stockCheck = await db.execute({
      sql: "SELECT SUM(quantity) as total FROM item_warehouse_stock WHERE warehouse_id = ?",
      args: [id],
    });
    const total = Number(stockCheck.rows[0]?.total ?? 0);
    if (total > 0) {
      return NextResponse.json({
        error: `لا يمكن حذف المخزن لأنه يحتوي على كمية (${total}). انقل الكميات لمخزن آخر أولاً.`,
      }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM warehouses WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "المخزن غير موجود" }, { status: 404 });
    }

    const count = await db.execute({
      sql: "SELECT COUNT(*) as cnt FROM warehouses WHERE company_id = ? AND is_active = 1",
      args: [companyId],
    });
    if ((count.rows[0]?.cnt as number) <= 1) {
      return NextResponse.json({ error: "يجب أن يبقى مخزن واحد على الأقل" }, { status: 400 });
    }

    await db.execute({
      sql: "UPDATE warehouses SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Warehouse delete error:", error);
    return NextResponse.json({ error: "فشل في الحذف" }, { status: 500 });
  }
}
