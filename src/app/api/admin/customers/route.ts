import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { ensureCompanyWarehouse } from "@/lib/warehouse";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const usePagination = searchParams.has("limit") || searchParams.has("offset") || searchParams.get("search");
  const limit = usePagination ? Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50)) : 10000;
  const offset = usePagination ? Math.max(0, Number(searchParams.get("offset")) || 0) : 0;
  const search = searchParams.get("search")?.trim() || "";

  try {
    let whereClause = "WHERE company_id = ? AND is_active = 1";
    const args: (string | number)[] = [companyId];
    if (search) {
      whereClause += " AND (LOWER(name) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)";
      const q = `%${search.toLowerCase()}%`;
      args.push(q, q, q);
    }

    let total = 0;
    if (usePagination) {
      const countRes = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM customers ${whereClause}`,
        args,
      });
      total = Number(countRes.rows[0]?.cnt ?? 0);
    }

    const result = await db.execute({
      sql: `SELECT id, name, phone, email, address, notes, created_at
            FROM customers
            ${whereClause}
            ORDER BY name
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    const customers = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
      notes: row.notes ?? null,
      created_at: row.created_at,
    }));

    if (usePagination) return NextResponse.json({ customers, total });
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Customers GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    await ensureCompanyWarehouse(companyId);
    const body = await request.json();
    const { name, phone, email, address, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "اسم العميل مطلوب" }, { status: 400 });
    }

    const phoneNorm = phone?.trim() || null;
    if (phoneNorm) {
      const existingPhone = await db.execute({
        sql: "SELECT id FROM customers WHERE company_id = ? AND phone = ?",
        args: [companyId, phoneNorm],
      });
      if (existingPhone.rows.length > 0) {
        return NextResponse.json({ error: "رقم الهاتف مستخدم لعميل آخر" }, { status: 400 });
      }
    }

    const id = randomUUID();

    await db.execute({
      sql: `INSERT INTO customers (id, company_id, name, phone, email, address, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        companyId,
        name.trim(),
        phoneNorm,
        email?.trim() || null,
        address?.trim() || null,
        notes?.trim() || null,
      ],
    });

    const newCustomer = await db.execute({
      sql: "SELECT id, name, phone, email, address, notes, created_at FROM customers WHERE id = ?",
      args: [id],
    });

    const row = newCustomer.rows[0];
    return NextResponse.json({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
      notes: row.notes ?? null,
      created_at: row.created_at,
    });
  } catch (error) {
    console.error("Customer POST error:", error);
    return NextResponse.json({ error: "فشل في حفظ العميل" }, { status: 500 });
  }
}
