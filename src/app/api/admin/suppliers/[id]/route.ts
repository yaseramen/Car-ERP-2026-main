import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  const row = await db.execute({
    sql: "SELECT id, name, phone, email, address, notes, created_at FROM suppliers WHERE id = ? AND company_id = ?",
    args: [id, companyId],
  });

  if (row.rows.length === 0) {
    return NextResponse.json({ error: "المورد غير موجود" }, { status: 404 });
  }

  const r = row.rows[0];
  return NextResponse.json({
    id: r.id,
    name: r.name,
    phone: r.phone ?? null,
    email: r.email ?? null,
    address: r.address ?? null,
    notes: r.notes ?? null,
    created_at: r.created_at,
  });
}

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
    const { name, phone, email, address, notes } = body;

    const updates: string[] = ["updated_at = datetime('now')"];
    const args: (string | null)[] = [];

    if (name !== undefined) {
      if (!name?.trim()) {
        return NextResponse.json({ error: "اسم المورد مطلوب" }, { status: 400 });
      }
      updates.push("name = ?");
      args.push(name.trim());
    }
    if (phone !== undefined) {
      const phoneVal = phone?.trim() || null;
      if (phoneVal) {
        const existingPhone = await db.execute({
          sql: "SELECT id FROM suppliers WHERE company_id = ? AND phone = ? AND id != ?",
          args: [companyId, phoneVal, id],
        });
        if (existingPhone.rows.length > 0) {
          return NextResponse.json({ error: "رقم الهاتف مستخدم لمورد آخر" }, { status: 400 });
        }
      }
      updates.push("phone = ?");
      args.push(phoneVal);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      args.push(email?.trim() || null);
    }
    if (address !== undefined) {
      updates.push("address = ?");
      args.push(address?.trim() || null);
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      args.push(notes?.trim() || null);
    }

    if (updates.length <= 1) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    args.push(id, companyId);

    await db.execute({
      sql: `UPDATE suppliers SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`,
      args: args as string[],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Supplier update error:", error);
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
    const usedInInvoices = await db.execute({
      sql: "SELECT 1 FROM invoices WHERE supplier_id = ? LIMIT 1",
      args: [id],
    });

    if (usedInInvoices.rows.length > 0) {
      await db.execute({
        sql: "UPDATE suppliers SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
        args: [id, companyId],
      });
      return NextResponse.json({ success: true, message: "تم تعطيل المورد (مستخدم سابقاً)" });
    }

    await db.execute({
      sql: "DELETE FROM suppliers WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Supplier delete error:", error);
    return NextResponse.json({ error: "فشل في الحذف" }, { status: 500 });
  }
}
