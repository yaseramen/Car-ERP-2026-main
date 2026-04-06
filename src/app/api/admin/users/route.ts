import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const SYSTEM_COMPANY_ID = "company-system";

function getCompanyId(session: { user?: { role?: string; companyId?: string | null } }): string | null {
  if (session.user?.role === "super_admin") return SYSTEM_COMPANY_ID;
  return session.user?.companyId ?? null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  try {
    const result = await db.execute({
      sql: `SELECT u.id, u.email, u.name, u.phone, u.role, u.is_active, u.is_blocked, u.created_at,
            u.assigned_warehouse_id, w.name as assigned_warehouse_name
            FROM users u
            LEFT JOIN warehouses w ON w.id = u.assigned_warehouse_id
            WHERE u.company_id = ?
            ORDER BY u.role DESC, u.name`,
      args: [companyId],
    });

    const users = result.rows.map((r) => ({
      id: String(r.id ?? ""),
      email: String(r.email ?? ""),
      name: String(r.name ?? ""),
      phone: r.phone ? String(r.phone) : null,
      role: String(r.role ?? ""),
      is_active: Number(r.is_active ?? 1) === 1,
      is_blocked: Number(r.is_blocked ?? 0) === 1,
      created_at: r.created_at,
      assigned_warehouse_id: r.assigned_warehouse_id ? String(r.assigned_warehouse_id) : null,
      assigned_warehouse_name: r.assigned_warehouse_name ? String(r.assigned_warehouse_name) : null,
    }));

    return NextResponse.json(users);
  } catch (error) {
    console.error("Users GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  try {
    const body = await request.json();
    const { email, password, name, phone, role } = body;

    if (!email || !password || !name) {
      return NextResponse.json({ error: "البريد وكلمة المرور والاسم مطلوبة" }, { status: 400 });
    }

    const userRole = role === "tenant_owner" ? "tenant_owner" : "employee";
    if (session.user.role === "tenant_owner" && userRole === "tenant_owner") {
      return NextResponse.json({ error: "لا يمكن إنشاء مالك آخر" }, { status: 403 });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [emailNorm],
    });
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "البريد مستخدم مسبقاً" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const userId = randomUUID();

    await db.execute({
      sql: `INSERT INTO users (id, company_id, email, password_hash, name, phone, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [userId, companyId, emailNorm, passwordHash, String(name).trim(), phone || null, userRole],
    });

    return NextResponse.json({
      id: userId,
      email: emailNorm,
      name: String(name).trim(),
      role: userRole,
    });
  } catch (error) {
    console.error("Users POST error:", error);
    return NextResponse.json({ error: "فشل في إنشاء المستخدم" }, { status: 500 });
  }
}
